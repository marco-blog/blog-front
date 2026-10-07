import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  adminRequest,
  callApi,
  logInWith,
  myUserId,
  newAccount,
  newGuestContext,
  publishPost,
  report,
  requireAdmin,
  requireAdminTestSettings,
  requireBackend,
  requireModerationTestSettings,
  signUp,
} from "./support/backend.js";

/**
 * 006 US2 회원·콘텐츠 관리(005 머지 후, quickstart #18·#20, T030·T039·T055): 회원 관리에서 이메일 전체 주소로 찾기(부분 주소는
 * 결과 없음) → 상세의 가입일·상태·글 수·받은 신고 → 블로그 한도 5("블로그 2개 / 한도 5개") → 기본값으로, 상세의 "이 회원의 글"과
 * "관리자 권한" 영역·"이 회원 대상 작업 기록"; 콘텐츠 관리에서 글 숨김 → 비로그인 404 → 숨긴 글 옛 주소가 `?status=HIDDEN` 목록으로 →
 * 숨김 해제 → 다시 보임; 대시보드 처리 대기 신고 카드가 신고 1건 뒤 늘어남.
 */
test.describe("006 US2 회원·콘텐츠 관리", () => {
  requireBackend();
  requireAdmin();
  requireAdminTestSettings();
  requireModerationTestSettings();
  test.describe.configure({ mode: "serial" });

  const writer = newAccount("am");
  const reporter = newAccount("ar");
  const run = writer.handle.slice(-6);
  const title = `회원관리${run} 숨김 글`;
  let writerId = 0;
  let postId = 0;

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logInWith(page, email, password);
  }

  test.beforeAll(async ({ browser }) => {
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await signUp(page, writer);
    writerId = await myUserId(page.request);
    expect(
      (await callApi(page.request, "POST", "/blogs", { handle: `${writer.handle}b` })).status,
    ).toBe(201);
    postId = await publishPost(page.request, writer.handle, {
      title,
      contentMarkdown: `${title} 본문`,
    });
    await context.close();
  });

  test("이메일 전체 주소로 찾기 → 상세 → 블로그 한도 5 → 기본값으로, 글·권한·작업 기록 링크(AS5·AS6, FR-160, #20)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    await page.goto("/admin/users");
    const search = page.getByRole("group", { name: "회원 찾기" });
    await search.getByLabel("찾는 방법").selectOption({ label: "이메일(정확히)" });
    // 부분 주소는 찾지 않는다(001 FR-135)
    await search.getByLabel("검색어").fill(writer.email.split("@")[0]);
    await search.getByRole("button", { name: "찾기" }).click();
    await expect(page.getByText("조건에 맞는 회원이 없습니다.")).toBeVisible();

    const again = page.getByRole("group", { name: "회원 찾기" });
    await again.getByLabel("찾는 방법").selectOption({ label: "이메일(정확히)" });
    await again.getByLabel("검색어").fill(writer.email);
    await again.getByRole("button", { name: "찾기" }).click();
    const list = page.getByRole("table", { name: "회원 목록" });
    await expect(list.getByRole("row")).toHaveCount(2);
    await list.getByRole("link", { name: writer.nickname }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${writerId}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `회원 상세: ${writer.nickname}`,
    );
    const facts = page.locator(".admin-user-facts");
    await expect(facts).toContainText("가입일");
    await expect(facts).toContainText("상태정상");
    await expect(facts).toContainText("글 수1");
    await expect(facts).toContainText("받은 신고0");

    const limit = page.getByRole("group", { name: "블로그 수 한도" });
    await expect(limit).toContainText("블로그 2개 / 한도 3개 (기본 한도)");
    await limit.getByRole("spinbutton", { name: "한도" }).fill("5");
    await limit.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 수 한도를 저장했습니다.");
    await expect(page.getByRole("group", { name: "블로그 수 한도" })).toContainText(
      "블로그 2개 / 한도 5개 (회원별 한도)",
    );
    await page
      .getByRole("group", { name: "블로그 수 한도" })
      .getByRole("button", { name: "기본값으로" })
      .click();
    await expect(page.getByRole("group", { name: "블로그 수 한도" })).toContainText(
      "블로그 2개 / 한도 3개 (기본 한도)",
    );

    // 006 T055: 관리자 권한 영역(E2E 관리자는 최고 관리자라 바꾸기 폼이 보인다. 여기서는 바꾸지 않는다 — US3 시나리오 몫)
    const role = page.getByRole("region", { name: "관리자 권한" });
    await expect(role).toContainText("지금 권한: 회원");
    await expect(role.getByRole("group", { name: "권한 바꾸기" })).toBeVisible();
    await role.getByRole("link", { name: "이 회원 대상 작업 기록" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/audit-log\\?targetType=USER&targetId=${writerId}$`),
    );
    const audit = page.getByRole("table", { name: "작업 기록 목록" });
    await expect(audit.getByRole("cell", { name: "블로그 수 한도 변경" })).toHaveCount(2);

    // 006 T039: 이 회원의 글 → 콘텐츠 관리(작성자 번호로)
    await page.goto(`/admin/users/${writerId}`);
    await page
      .getByRole("region", { name: "이 회원의 글·댓글" })
      .getByRole("link", { name: "이 회원의 글" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/admin/contents/posts\\?authorId=${writerId}$`));
    await expect(
      page.getByRole("table", { name: "콘텐츠 목록" }).getByRole("link", { name: title }),
    ).toBeVisible();
  });

  test("콘텐츠 관리에서 글 숨김 → 비로그인 404 → 숨긴 글(옛 주소) 목록에서 숨김 해제 → 다시 보임(#18)", async ({
    browser,
    page,
  }) => {
    test.setTimeout(90_000);
    const guestContext = await newGuestContext(browser);
    const guest = guestContext.request;
    expect((await guest.get(`/${writer.handle}/${postId}`)).status()).toBe(200);

    await asAdmin(page);
    await page.goto(`/admin/contents/posts?handle=${writer.handle}`);
    const table = page.getByRole("table", { name: "콘텐츠 목록" });
    const row = table.getByRole("row").filter({ hasText: title });
    await row.getByRole("textbox", { name: `숨김 사유: ${title}` }).fill("광고 글");
    await row.getByRole("button", { name: `숨김: ${title}` }).click();
    await expect(page.getByRole("status")).toHaveText("숨겼습니다.");
    await expect(
      page
        .getByRole("table", { name: "콘텐츠 목록" })
        .getByRole("button", { name: `숨김 해제: ${title}` }),
    ).toBeVisible();
    expect((await guest.get(`/${writer.handle}/${postId}`)).status()).toBe(404);

    // 005 숨긴 글 화면은 콘텐츠 관리의 숨김 목록으로 흡수했다(옛 주소는 리다이렉트, 메뉴에는 없음)
    await expect(
      page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link", { name: "숨긴 글" }),
    ).toHaveCount(0);
    await page.goto("/admin/contents/hidden-posts");
    await expect(page).toHaveURL(/\/admin\/contents\/posts\?status=HIDDEN$/);
    await expect(
      page.getByRole("search", { name: "찾기" }).getByRole("combobox", { name: "상태" }),
    ).toHaveValue("HIDDEN");
    const hidden = page.getByRole("table", { name: "콘텐츠 목록" });
    await hidden.getByRole("button", { name: `숨김 해제: ${title}` }).click();
    await expect(page.getByRole("status")).toHaveText("숨김을 해제했습니다.");
    await expect(
      page.getByRole("table", { name: "콘텐츠 목록" }).getByRole("link", { name: title }),
    ).toHaveCount(0);
    expect((await guest.get(`/${writer.handle}/${postId}`)).status()).toBe(200);
    await guestContext.close();
  });

  test("대시보드 처리 대기 신고 카드가 신고 1건 뒤 늘어난다(FR-103, T039)", async ({
    browser,
    page,
    playwright,
  }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    await page.goto("/admin");
    const card = page
      .getByRole("region", { name: "전체" })
      .getByRole("listitem")
      .filter({ hasText: "처리 대기 신고" });
    await expect(card.getByRole("link", { name: "처리 대기 신고" })).toHaveAttribute(
      "href",
      "/admin/reports",
    );
    const before = Number((await card.locator("strong").innerText()).replace(/\D/g, ""));

    const context = await newGuestContext(browser);
    const member = await context.newPage();
    await signUp(member, reporter);
    const filed = await report(member.request, "POST", postId, "SPAM");
    expect(filed.status).toBe(201);
    await context.close();

    await page.reload();
    const after = Number((await card.locator("strong").innerText()).replace(/\D/g, ""));
    expect(after).toBeGreaterThan(before);

    // 다른 시나리오의 대기 수를 흔들지 않도록 기각해 둔다
    const admin = await adminRequest(playwright);
    const dismissed = await callApi(admin, "POST", `/admin/reports/${filed.id}/resolve`, {
      decision: "DISMISS",
    });
    expect(dismissed.status).toBe(200);
    await admin.dispose();
  });
});
