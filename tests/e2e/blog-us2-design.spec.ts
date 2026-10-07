import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  callApi,
  logIn,
  newAccount,
  newGuestContext,
  requireBackend,
  signUp,
} from "./support/backend.js";

/**
 * 004 US2 꾸미기·탐색 Independent Test(quickstart #8~16, T063): 공지 1편은 홈 목록 위에만, 사이드바 VISITORS·ARCHIVE·TAGS를 켜고
 * CATEGORIES를 끄면 홈·글 상세 사이드바에 반영, 보관함 달을 누르면 그 달 글만, 서로 다른 방문자 둘이 3번씩 보면 주인 통계 오늘 2,
 * 블로그 안 검색과 태그 목록. backend가 있어야 돈다(E2E_BACKEND_URL).
 * 방문자 수를 맞추려고 방문자 시나리오 전에는 블로그 화면을 주인으로만 연다(주인 방문은 세지 않는다).
 */
test.describe("004 US2 꾸미기·탐색", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("da");
  const word = `w${owner.handle.slice(-8)}`;
  const tagA = `ta${owner.handle.slice(-6)}`;
  const tagB = `tb${owner.handle.slice(-6)}`;
  const titles = {
    notice: `공지 ${word}`,
    first: `첫 글 ${word}`,
    second: "둘째 글",
  };
  let postId = 0;

  async function publish(
    request: APIRequestContext,
    post: { title: string; tags: string[]; notice?: boolean },
  ) {
    const draft = await callApi<{ id: number }>(
      request,
      "POST",
      `/blogs/${owner.handle}/posts/drafts`,
      { title: post.title, contentMarkdown: `${post.title} 본문입니다.`, tags: post.tags },
    );
    expect(draft.status).toBe(201);
    const published = await callApi(request, "POST", `/posts/${draft.body.result.id}/publish`, {
      visibility: "PUBLIC",
      commentEnabled: true,
      notice: post.notice ?? false,
    });
    expect(published.status).toBe(200);
    return draft.body.result.id;
  }

  const postList = (page: Page) => page.getByRole("list", { name: "글 목록" });
  const sidebar = (page: Page) => page.getByRole("complementary", { name: "블로그 사이드바" });

  test("공지로 정한 글은 홈 목록 위 공지에만 나온다(AS1)", async ({ page }) => {
    await signUp(page, owner);
    await publish(page.request, { title: titles.notice, tags: [tagA], notice: true });
    postId = await publish(page.request, { title: titles.first, tags: [tagA, tagB] });
    await publish(page.request, { title: titles.second, tags: [tagA] });

    await page.goto(`/${owner.handle}`);
    const notices = page.getByRole("region", { name: "공지" });
    await expect(notices.getByRole("link", { name: titles.notice })).toBeVisible();
    await expect(notices).toContainText("공지");
    await expect(postList(page)).toContainText(titles.first);
    await expect(postList(page)).toContainText(titles.second);
    await expect(postList(page)).not.toContainText(titles.notice);

    await page.goto(`/${owner.handle}/notice`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("공지");
    await expect(page.getByRole("main")).toContainText(titles.notice);
  });

  test("꾸미기에서 방문자·보관함·태그를 켜고 카테고리를 끄면 홈·글 상세 사이드바가 바뀐다(AS2)", async ({
    page,
  }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/design`);
    const editor = page.getByRole("form", { name: "사이드바" });
    for (const name of ["방문자", "보관함", "태그"]) {
      await editor.getByLabel(name, { exact: true }).check();
    }
    await editor.getByLabel("카테고리", { exact: true }).uncheck();
    await editor.getByRole("button", { name: "사이드바 저장" }).click();
    await expect(page.getByRole("status")).toHaveText("사이드바를 저장했습니다.");

    // "위로"는 바로 저장한다: 방문자를 한 칸 올려도 켠 상태는 그대로다.
    await editor.getByRole("button", { name: "방문자 위로" }).click();
    await expect(page.getByRole("status")).toHaveText("사이드바를 저장했습니다.");
    await expect(editor.getByLabel("방문자", { exact: true })).toBeChecked();

    for (const path of [`/${owner.handle}`, `/${owner.handle}/${postId}`]) {
      await page.goto(path);
      const aside = sidebar(page);
      for (const name of ["방문자", "보관함", "태그"]) {
        await expect(aside.getByRole("heading", { name, exact: true })).toBeVisible();
      }
      await expect(aside.getByRole("heading", { name: "카테고리", exact: true })).toHaveCount(0);
      await expect(aside.getByRole("link", { name: new RegExp(`#${tagA}`) })).toBeVisible();
    }
  });

  test("보관함에서 달을 누르면 그 달 글만 나온다(AS3)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}`);
    const archive = sidebar(page).getByRole("region", { name: "보관함" });
    await expect(archive.getByRole("link")).toHaveCount(1);
    await archive.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/archive/\\d{4}/\\d{1,2}$`));
    for (const title of Object.values(titles)) {
      await expect(postList(page)).toContainText(title);
    }

    await page.goto(`/${owner.handle}/archive/2001/1`);
    await expect(page.getByRole("main")).toContainText("아직 발행한 글이 없습니다.");
    const missing = await page.goto(`/${owner.handle}/archive/2001/13`);
    expect(missing?.status()).toBe(404);
  });

  test("블로그 안 검색과 태그 목록", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/${postId}`);
    await expect(sidebar(page).getByRole("heading", { name: "검색", exact: true })).toBeVisible();
    await sidebar(page).getByLabel("이 블로그에서 검색").fill(word);
    await sidebar(page).getByRole("button", { name: "검색" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/search\\?q=${word}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("블로그 검색");
    // 전문 검색 색인 반영을 기다린다.
    await expect(async () => {
      await page.reload();
      await expect(postList(page)).toContainText(titles.first);
    }).toPass({ timeout: 30_000 });
    await expect(postList(page)).not.toContainText(titles.second);

    await page.goto(`/${owner.handle}/tags`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("태그");
    const tags = page.getByRole("main").getByRole("list", { name: "태그 목록" });
    await expect(tags.getByRole("link")).toHaveText([`#${tagA} (3)`, `#${tagB} (1)`]);
    await tags.getByRole("link", { name: new RegExp(`#${tagB}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/tags/${tagB}$`));
    await expect(postList(page)).toContainText(titles.first);
    await expect(postList(page)).not.toContainText(titles.second);
  });

  test("서로 다른 방문자 둘이 3번씩 보면 주인 통계의 오늘 방문자는 2(AS4)", async ({
    browser,
    page,
  }) => {
    for (let visitor = 0; visitor < 2; visitor++) {
      const context = await newGuestContext(browser);
      const guest = await context.newPage();
      for (const path of [`/${owner.handle}`, `/${owner.handle}/${postId}`, `/${owner.handle}`]) {
        const response = await guest.goto(path);
        expect(response?.status()).toBe(200);
      }
      await context.close();
    }

    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/stats`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("통계");
    const today = page.locator(".manage-stats > div", {
      has: page.getByText("오늘", { exact: true }),
    });
    await expect(today.locator("dd")).toHaveText("2");

    await page.goto(`/${owner.handle}`);
    const visitors = sidebar(page).getByRole("region", { name: "방문자" });
    await expect(visitors).toContainText("오늘2");
  });
});
