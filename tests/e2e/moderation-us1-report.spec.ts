import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  adminRequest,
  callApi,
  logIn,
  logOut,
  newAccount,
  newGuestContext,
  publishPost,
  report,
  requireAdmin,
  requireBackend,
  requireModerationTestSettings,
  signUp,
  uniqueText,
  adminAccount,
  logInWith,
} from "./support/backend.js";

/**
 * 005 US1 신고·숨김(quickstart #1~6, T048): 회원 B가 A의 글을 신고(같은 대상 두 번째 신고는 409), 관리자가 /admin/reports에서
 * 숨기면 비회원·B에게 404이고 블로그 목록·검색에서 빠지며 A에게는 "관리자가 숨긴 글" 안내. 신고된 댓글은 숨기면 (답글이 없으므로)
 * 다른 사람의 목록에서 빠지고 작성자에게만 보인다. 기각하면 신고자에게 결과 알림. 일반 회원은 /admin/reports 404, 비로그인 관리자 API 404.
 * 비회원 권리 침해 신고는 관리자 화면에 연락 이메일과 함께 보이고 처리하면 결과 메일(MAILPIT_URL이 있을 때만 확인).
 */
test.describe("005 US1 신고·숨김", () => {
  requireBackend();
  requireModerationTestSettings();
  requireAdmin();
  test.describe.configure({ mode: "serial" });

  const writer = newAccount("ra");
  const reporter = newAccount("rb");
  const word = `숨김${writer.handle.slice(-6)}`;
  const hiddenTitle = `신고될 글 ${word}`;
  const keptTitle = `댓글 달린 글 ${writer.handle.slice(-6)}`;
  const commentText = uniqueText("신고될 댓글입니다");
  const contactEmail = `rights-${writer.handle}@example.test`;
  const mailpitUrl = process.env.MAILPIT_URL;
  let hiddenId = 0;
  let keptId = 0;

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logOut(page);
    await logInWith(page, email, password);
  }

  /**
   * scope 안의 "신고" 레이어를 열고 신고 양식을 돌려준다. 화면이 하이드레이션되기 전에 누른 클릭은 `<details>`가 다시 닫힐 수
   * 있어, 양식이 보일 때까지 다시 누른다.
   */
  async function openReport(scope: Page | Locator, name: string) {
    const form = scope.getByRole("form", { name });
    await expect(async () => {
      if (!(await form.isVisible())) {
        await scope.getByText("신고", { exact: true }).click();
      }
      await expect(form).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    return form;
  }

  /** 대기 탭에서 `targetType`으로 거른 신고 묶음 중 `text`가 든 행의 상세로 간다. */
  async function openPendingGroup(page: Page, targetType: string, text: string) {
    await page.goto(`/admin/reports?targetType=${targetType}`);
    const row = page
      .getByRole("table", { name: "신고 목록" })
      .getByRole("row")
      .filter({ hasText: text });
    await row.getByRole("link", { name: /^신고 \d+건$/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "신고 상세" })).toBeVisible();
  }

  test("B가 A의 글과 댓글을 신고하고, 같은 글을 다시 신고하면 409(#1)", async ({ page }) => {
    test.setTimeout(90_000);
    await signUp(page, writer);
    hiddenId = await publishPost(page.request, writer.handle, {
      title: hiddenTitle,
      contentMarkdown: "신고되어 숨겨질 글의 본문입니다.",
    });
    keptId = await publishPost(page.request, writer.handle, {
      title: keptTitle,
      contentMarkdown: "댓글이 신고될 글의 본문입니다.",
    });
    const comment = await callApi(page.request, "POST", `/posts/${keptId}/comments`, {
      content: commentText,
    });
    expect(comment.status).toBe(201);
    await logOut(page);

    await signUp(page, reporter);
    await page.goto(`/${writer.handle}/${hiddenId}`);
    const form = await openReport(page, "글 신고");
    await form.getByLabel("스팸·광고").check();
    await form.getByRole("button", { name: "신고하기" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "신고가 접수되었습니다." }),
    ).toBeVisible();

    const again = await report(page.request, "POST", hiddenId);
    expect(again.status).toBe(409);
    expect(again.resultCode).toBe("REPORT_ALREADY_EXISTS");

    await page.goto(`/${writer.handle}/${keptId}`);
    const target = page
      .getByRole("list", { name: "댓글 목록" })
      .getByRole("article", { name: writer.nickname });
    const commentForm = await openReport(target, "댓글 신고");
    await commentForm.getByLabel("욕설·괴롭힘").check();
    await commentForm.getByRole("button", { name: "신고하기" }).click();
    await expect(target.getByRole("status")).toHaveText("신고가 접수되었습니다.");
  });

  test("일반 회원은 /admin/reports 404, 비로그인 관리자 API 404(#6)", async ({ page, browser }) => {
    await logIn(page, reporter);
    const denied = await page.goto("/admin/reports");
    expect(denied?.status()).toBe(404);
    const api = await callApi(page.request, "GET", "/admin/reports");
    expect(api.status).toBe(404);

    const guest = await newGuestContext(browser);
    const anonymous = await callApi(guest.request, "GET", "/admin/reports");
    expect(anonymous.status).toBe(404);
    expect(anonymous.body.header.resultCode).toBe("NOT_FOUND");
    await guest.close();
  });

  test("관리자가 글을 숨기면 비회원·B에게 404, 목록·검색에서 빠지고 A에게는 안내(#2·3)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    await openPendingGroup(page, "POST", hiddenTitle);
    await expect(page.getByText(reporter.nickname)).toBeVisible();
    await page.getByRole("button", { name: "숨김", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("신고 1건을 처리했습니다.");
    await expect(page.getByRole("button", { name: "숨김 해제" })).toBeVisible();

    const guest = await newGuestContext(browser);
    const guestPage = await guest.newPage();
    const gone = await guestPage.goto(`/${writer.handle}/${hiddenId}`);
    expect(gone?.status()).toBe(404);
    await guestPage.goto(`/${writer.handle}`);
    const list = guestPage.getByRole("list", { name: "글 목록" });
    await expect(list.getByRole("link", { name: keptTitle })).toBeVisible();
    await expect(guestPage.getByText(hiddenTitle)).toHaveCount(0);
    await guestPage.goto(`/search?q=${encodeURIComponent(word)}`);
    await expect(
      guestPage.getByText("검색 결과가 없습니다. 다른 낱말로 찾아보세요."),
    ).toBeVisible();
    await guest.close();

    await logOut(page);
    await logIn(page, reporter);
    const forReporter = await page.goto(`/${writer.handle}/${hiddenId}`);
    expect(forReporter?.status()).toBe(404);

    await logOut(page);
    await logIn(page, writer);
    await page.goto(`/${writer.handle}/${hiddenId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(hiddenTitle);
    await expect(
      page.getByText(
        "관리자가 숨긴 글입니다. 다른 사람에게 보이지 않으며 다시 발행할 수 없습니다.",
      ),
    ).toBeVisible();
  });

  test("숨긴 댓글은 다른 사람의 목록에서 빠지고 작성자에게만 내용이 보인다(#4)", async ({
    page,
    browser,
  }) => {
    await asAdmin(page);
    await openPendingGroup(page, "COMMENT", commentText);
    await page.getByRole("button", { name: "숨김", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("신고 1건을 처리했습니다.");

    const guest = await newGuestContext(browser);
    const guestPage = await guest.newPage();
    await guestPage.goto(`/${writer.handle}/${keptId}`);
    // 답글이 없는 숨긴 댓글은 다른 사람에게 목록에서 빠지고 개수에서도 빠진다(research M1).
    await expect(guestPage.getByRole("heading", { name: "댓글 0" })).toBeVisible();
    await expect(guestPage.getByText(commentText)).toHaveCount(0);
    await guest.close();

    await logOut(page);
    await logIn(page, writer);
    await page.goto(`/${writer.handle}/${keptId}`);
    const mine = page
      .getByRole("list", { name: "댓글 목록" })
      .getByRole("article", { name: writer.nickname });
    await expect(mine).toContainText(commentText);
    await expect(mine.getByRole("note")).toHaveText("관리자가 숨긴 글입니다. 나에게만 보입니다.");
  });

  test("기각하면 신고자에게 결과 알림이 간다(#5)", async ({ page }) => {
    await logIn(page, reporter);
    const filed = await report(page.request, "POST", keptId, "OTHER", "기각될 신고입니다");
    expect(filed.status).toBe(201);

    await asAdmin(page);
    await openPendingGroup(page, "POST", keptTitle);
    await page.getByRole("button", { name: "기각" }).click();
    await expect(page.getByRole("status")).toHaveText("신고 1건을 처리했습니다.");

    await logOut(page);
    await logIn(page, reporter);
    await expect
      .poll(
        async () => {
          await page.goto("/notifications");
          return page.getByText("신고하신 콘텐츠를 검토했으나 조치하지 않았습니다.").count();
        },
        { timeout: 30_000, intervals: [1_000, 2_000] },
      )
      .toBeGreaterThan(0);
  });

  test("비회원 권리 침해 신고가 관리자 화면에 연락 이메일과 함께 보이고 처리된다(#7)", async ({
    page,
    browser,
    playwright,
  }) => {
    test.setTimeout(90_000);
    const guest = await newGuestContext(browser);
    const guestPage = await guest.newPage();
    const base = test.info().project.use.baseURL ?? "";
    await guestPage.goto("/rights-request");
    await guestPage.getByLabel("신고할 주소").fill(`${base}/${writer.handle}/${keptId}`);
    await guestPage.getByLabel("저작권 침해").check();
    await guestPage.getByLabel("권리 근거").fill("제가 쓴 글을 허락 없이 그대로 옮겨 실었습니다.");
    await guestPage.getByLabel("연락받을 이메일").fill(contactEmail);
    await guestPage.getByRole("button", { name: "신고 접수" }).click();
    await expect(guestPage).toHaveURL(/\/rights-request\?submitted=1$/);
    await expect(
      guestPage.getByText("접수되었습니다. 처리 결과는 이메일로 안내합니다."),
    ).toBeVisible();
    await guest.close();

    // 관리자 API에도 대상이 정해진 권리 침해 묶음으로 잡힌다.
    const admin = await adminRequest(playwright);
    const groups = await callApi<
      Array<{ representativeId: number; channel: string; target: { id: number } | null }>
    >(admin, "GET", "/admin/reports?targetType=POST");
    expect(groups.status).toBe(200);
    expect(groups.body.result.some((g) => g.channel !== "MEMBER" && g.target?.id === keptId)).toBe(
      true,
    );
    await admin.dispose();

    await asAdmin(page);
    await openPendingGroup(page, "POST", keptTitle);
    const rights = page.getByRole("region", { name: "권리 침해 정보" });
    await expect(rights).toContainText(contactEmail);
    await expect(rights).toContainText(`/${writer.handle}/${keptId}`);
    await page.getByRole("button", { name: "기각" }).click();
    await expect(page.getByRole("status")).toHaveText("신고 1건을 처리했습니다.");
    await expect(page.getByRole("heading", { name: "처리 결과" })).toBeVisible();

    if (mailpitUrl) {
      await expect
        .poll(
          async () => {
            const search = await fetch(
              `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${contactEmail}`)}`,
            );
            const { messages } = (await search.json()) as { messages: unknown[] };
            return messages.length;
          },
          { timeout: 30_000, intervals: [1_000, 2_000] },
        )
        .toBeGreaterThan(0);
    }
  });
});
