import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  callApi,
  logIn,
  logInWith,
  logOut,
  newAccount,
  requireAdmin,
  requireBackend,
  signUp,
} from "./support/backend.js";

/**
 * 003 US5 릴리스 노트(quickstart #32~39, T117): 관리 API로 vX.2.0(ko·en)·vX.2.1(ko)·vX.3.0(ko)을 게시하면 비로그인 메인에
 * 최신 카드, `/updates`에 major.minor 트리와 최신 본문·목차, 앵커 주소. 화면 언어 ja면 없는 언어판 대신 en → ko와 안내.
 * 게시 전에 가입한 회원은 배너를 보고, 닫으면 다른 브라우저에서도 다시 보이지 않는다. 초안 주소는 404. 검색.
 * 버전 번호는 실행마다 새로 만들어 같은 DB에서 여러 번 돌려도 겹치지 않고 가장 새 버전이 된다. 각 자리는 6자리까지라
 * major는 2026-01-01부터 센 날 수(+1000), minor는 그날의 초×10에 더한다.
 */
test.describe("003 US5 릴리스 노트", () => {
  requireBackend();
  requireAdmin();
  test.describe.configure({ mode: "serial" });

  const sinceEpoch = Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000);
  const major = 1000 + Math.floor(sinceEpoch / 86_400);
  const minorBase = (sinceEpoch % 86_400) * 10;
  const v = (minor: number, patch: number) => `${major}.${minorBase + minor}.${patch}`;
  const reader = newAccount("pu");
  const noteIds: number[] = [];

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logOut(page);
    await logInWith(page, email, password);
  }

  async function createNote(
    page: Page,
    version: string,
    contents: Record<string, { title: string; contentMarkdown: string }>,
    publish = true,
  ) {
    const created = await callApi<{ id: number; revisionNo: number }>(
      page.request,
      "POST",
      "/admin/release-notes",
      { version, releaseDate: "2026-10-06", contents },
    );
    expect(created.status, version).toBe(201);
    noteIds.push(created.body.result.id);
    if (publish) {
      const published = await callApi(
        page.request,
        "POST",
        `/admin/release-notes/${created.body.result.id}/publish`,
      );
      expect(published.status, version).toBe(200);
    }
    return created.body.result;
  }

  const body = (title: string) =>
    `## 새 기능\n\n${title}에서 포털과 주제 페이지 기능을 더했습니다.\n\n### 주제\n\n주제별로 글을 모아 봅니다.\n\n## 고친 점\n\n자잘한 문제를 고쳤습니다.`;

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await asAdmin(page);
    for (const id of noteIds) {
      await callApi(page.request, "POST", `/admin/release-notes/${id}/unpublish`);
      await callApi(page.request, "DELETE", `/admin/release-notes/${id}`);
    }
    await page.close();
  });

  test("게시 → 비로그인 메인 맨 위 카드, /updates 트리·최신 본문·목차·canonical(#32, #33)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    // 배너 시나리오용 회원은 게시보다 먼저 가입한다.
    await signUp(page, reader);
    await asAdmin(page);
    const first = await createNote(page, v(2, 0), {
      ko: { title: `${v(2, 0)} 첫 소식`, contentMarkdown: body("한국어판") },
      en: {
        title: `${v(2, 0)} first news`,
        contentMarkdown: "## New features\n\nEnglish edition.",
      },
    });
    await createNote(page, v(2, 1), {
      ko: { title: `${v(2, 1)} 고침`, contentMarkdown: body("고침판") },
    });
    await createNote(page, v(3, 0), {
      ko: { title: `${v(3, 0)} 새 기능`, contentMarkdown: body("최신판") },
    });
    await createNote(page, v(3, 1), { ko: { title: "초안", contentMarkdown: "초안" } }, false);
    // v(2, 0)을 두 번 고친다(수정 이력 #37).
    for (const [index, text] of ["두 번째 내용", "세 번째 내용"].entries()) {
      const updated = await callApi(page.request, "PUT", `/admin/release-notes/${first.id}`, {
        version: v(2, 0),
        releaseDate: "2026-10-06",
        baseRevisionNo: first.revisionNo + index,
        contents: {
          ko: { title: `${v(2, 0)} 첫 소식`, contentMarkdown: `${body(text)}` },
          en: { title: `${v(2, 0)} first news`, contentMarkdown: "## New features\n\nEnglish." },
        },
      });
      expect(updated.status).toBe(200);
    }
    await logOut(page);

    await page.goto("/");
    const card = page.locator(".portal-release-note");
    await expect(card).toContainText(`${v(3, 0)} 새 기능`);
    await card.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/updates/v${v(3, 0)}$`));

    await page.goto("/updates");
    const tree = page.getByRole("navigation", { name: "버전 목록" });
    await expect(tree.getByText(`v${major}.${minorBase + 3}`, { exact: true })).toBeVisible();
    await expect(tree.getByText(`v${major}.${minorBase + 2}`, { exact: true })).toBeVisible();
    const ours = (await tree.getByRole("link").allTextContents()).filter((text) =>
      text.startsWith(`v${major}.`),
    );
    expect(ours.map((text) => text.split(" ")[0])).toEqual([
      `v${v(3, 0)}`,
      `v${v(2, 1)}`,
      `v${v(2, 0)}`,
    ]);
    const article = page.getByRole("article");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(`${v(3, 0)} 새 기능`);
    await expect(article.getByRole("navigation", { name: "목차" })).toContainText("고친 점");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/updates/v${v(3, 0)}$`),
    );
  });

  test("앵커 주소(JS 끔)·목차·이전 다음 링크, 초안 404(#34, #38)", async ({ browser, page }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "ko-KR" });
    const noJs = await context.newPage();
    const response = await noJs.goto(`/updates/v${v(2, 0)}#새-기능`);
    expect(response?.status()).toBe(200);
    await expect(noJs.locator('h2[id="새-기능"]')).toBeVisible();
    await expect(noJs.locator('meta[name="description"]')).toHaveAttribute("content", /새 기능/);
    await context.close();

    await page.goto(`/updates/v${v(2, 1)}`);
    await page
      .getByRole("navigation", { name: "목차" })
      .getByRole("link", { name: "주제" })
      .click();
    await expect(page).toHaveURL((url) => decodeURIComponent(url.hash) === "#주제");
    await page.getByRole("link", { name: new RegExp(`다음 버전: v${v(3, 0)}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/updates/v${v(3, 0)}$`));

    expect((await page.request.get(`/updates/v${v(3, 1)}`)).status()).toBe(404);
    expect((await page.request.get(`/updates/${v(3, 0)}`)).status()).toBe(404);
  });

  test("화면 언어 ja: v.2.0은 영어판, v.2.1은 한국어판과 언어판 안내(#35)", async ({ browser }) => {
    const context = await browser.newContext({ locale: "ja-JP" });
    const page = await context.newPage();
    await page.goto(`/updates/v${v(2, 0)}`);
    await expect(page.getByRole("article").getByRole("heading", { level: 1 })).toHaveText(
      `${v(2, 0)} first news`,
    );
    await expect(page.getByRole("note")).toContainText("英語版");
    await page.goto(`/updates/v${v(2, 1)}`);
    await expect(page.getByRole("note")).toContainText("韓国語版");
    await context.close();
  });

  test("검색: 2자 이상이면 결과, 1자면 입력란 문구(#36)", async ({ page }) => {
    await page.goto(`/updates?q=${encodeURIComponent("최신판")}`);
    const results = page.getByRole("region", { name: "「최신판」 검색 결과" });
    await expect(results.getByRole("link", { name: new RegExp(`v${v(3, 0)}`) })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

    await page.goto("/updates?q=기");
    await expect(page.getByText("2자 이상 입력해 주세요.")).toBeVisible();
  });

  test("수정 이력과 이전 수정본(#37)", async ({ page }) => {
    await page.goto(`/updates/v${v(2, 0)}`);
    await page.getByRole("link", { name: "수정 이력" }).click();
    await expect(page).toHaveURL(new RegExp(`/updates/v${v(2, 0)}/history$`));
    const revisions = page.getByRole("list", { name: "수정본 목록" }).getByRole("link");
    await expect.poll(() => revisions.count()).toBeGreaterThanOrEqual(2);
    await revisions.last().click();
    await expect(page.getByRole("note").first()).toContainText("이전 수정본");
    await expect(page.getByRole("article")).toContainText("한국어판");
  });

  test("게시 전에 가입한 회원은 배너를 보고, 닫으면 다른 브라우저에서도 보이지 않는다(#39)", async ({
    browser,
  }) => {
    const first = await browser.newContext({ locale: "ko-KR" });
    const page = await first.newPage();
    await logIn(page, reader);
    await page.goto(`/${reader.handle}`);
    const banner = page.getByRole("complementary", { name: "새 업데이트 소식" });
    await expect(banner).toContainText(`v${v(3, 0)}`);
    // fetcher가 보내는 동안에도 배너는 숨는다. 저장 응답을 기다린 뒤 새로 고친다.
    const seen = page.waitForResponse(
      (response) =>
        response.url().includes("/updates/seen") && response.request().method() === "POST",
    );
    await banner.getByRole("button", { name: "닫기" }).click();
    await expect(banner).toHaveCount(0);
    expect((await seen).ok()).toBe(true);
    await page.reload();
    await expect(page.getByRole("complementary", { name: "새 업데이트 소식" })).toHaveCount(0);
    await first.close();

    const second = await browser.newContext({ locale: "ko-KR" });
    const other = await second.newPage();
    await logIn(other, reader);
    await other.goto("/");
    await expect(other.getByRole("complementary", { name: "새 업데이트 소식" })).toHaveCount(0);
    await second.close();

    // 게시 뒤에 가입한 회원에게는 배너가 없다(#40)
    const third = await browser.newContext({ locale: "ko-KR" });
    const late = await third.newPage();
    await signUp(late, newAccount("pv"));
    await expect(late.getByRole("complementary", { name: "새 업데이트 소식" })).toHaveCount(0);
    await third.close();
  });
});
