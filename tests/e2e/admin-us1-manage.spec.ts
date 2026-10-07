import { expect, test } from "@playwright/test";

import {
  callApi,
  logIn,
  newAccount,
  newGuestContext,
  publishPost,
  requireBackend,
  signUp,
  uniqueText,
} from "./support/backend.js";

/**
 * 006 US1 블로그 관리(quickstart #1~#9, T017): 가입 → 블로그 2개 → 글·임시저장 글·댓글 → `/manage` 대시보드 수치 →
 * 글 관리 "임시저장" + 제목 검색 → 작성 화면까지 30초 이하(SC-016) → 카테고리 추가 → 설정 제목 변경이 블로그에 반영,
 * 일괄 작업(공개 범위·카테고리 이동·휴지통·복구), 블로그 전환(같은 메뉴), 남의 관리 화면 404·API 403, noindex 헤더.
 */
test.describe("006 US1 블로그 관리", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("mu");
  const second = `${owner.handle}-dev`;
  const run = owner.handle.slice(-6);
  const draftTitle = `임시저장${run} 초안`;
  const posts = [`관리${run} 첫 글`, `관리${run} 둘째 글`];
  const category = `분류${run}`;

  test("대시보드 수치 → 임시저장 글 찾기 → 작성 화면까지 30초 이하(SC-016, #1~#4)", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signUp(page, owner);
    expect((await callApi(page.request, "POST", "/blogs", { handle: second })).status).toBe(201);
    const ids: number[] = [];
    for (const title of posts) {
      ids.push(
        await publishPost(page.request, owner.handle, { title, contentMarkdown: `${title} 본문` }),
      );
    }
    const draft = await callApi<{ id: number }>(
      page.request,
      "POST",
      `/blogs/${owner.handle}/posts/drafts`,
      {
        title: draftTitle,
        contentMarkdown: "아직 쓰는 중",
      },
    );
    expect(draft.status).toBe(201);
    const comment = await callApi(page.request, "POST", `/posts/${ids[0]}/comments`, {
      content: uniqueText("관리 댓글"),
    });
    expect(comment.status).toBe(201);

    const started = Date.now();
    // 블로그가 2개이고 최근 블로그 쿠키가 없으면 `/manage`는 블로그 선택 화면으로 간다.
    await page.goto("/manage");
    await expect(page).toHaveURL(
      new RegExp(`/((${owner.handle}|${second})/manage|settings/blogs)$`),
    );
    await page.goto(`/${owner.handle}/manage`);
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    await expect(page.getByRole("link", { name: "1편" })).toHaveAttribute(
      "href",
      `/${owner.handle}/manage/posts?status=DRAFT`,
    );
    await expect(page.getByRole("link", { name: posts[1] })).toBeVisible();
    await expect(page.getByText("1개", { exact: true })).toBeVisible();

    await page
      .getByRole("navigation", { name: "블로그 관리 메뉴" })
      .getByRole("link", { name: "글 관리" })
      .click();
    const filter = page.getByRole("search", { name: "글 찾기" });
    await filter.getByLabel("상태").selectOption("DRAFT");
    await filter.getByLabel("제목 검색").fill(draftTitle);
    await filter.getByRole("button", { name: "찾기" }).click();
    await expect(page).toHaveURL(/status=DRAFT/);
    await page
      .getByRole("list", { name: "글 목록" })
      .getByRole("link", { name: draftTitle })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/write/${draft.body.result.id}$`));
    await expect(page.getByRole("button", { name: "완료" })).toBeVisible();
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  test("카테고리 추가, 설정 제목 변경이 블로그 홈에 반영(#5·#6)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/categories`);
    const form = page.getByRole("group", { name: "새 카테고리" });
    await form.getByLabel("이름").fill(category);
    await form.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("status")).toHaveText("카테고리를 만들었습니다.");

    await page.goto(`/${owner.handle}/manage/settings`);
    await page.getByLabel("블로그 제목").fill(`관리${run} 블로그`);
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 설정을 저장했습니다.");
    await page.goto(`/${owner.handle}`);
    await expect(page.getByRole("heading", { name: `관리${run} 블로그` })).toBeVisible();
  });

  test("일괄 작업: 비공개로, 카테고리 옮기기, 휴지통 → 복구(#7)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/posts?status=PUBLISHED`);
    await page.getByLabel(`${posts[0]} 선택`).check();
    await page.getByRole("button", { name: "비공개로 바꾸기" }).click();
    await expect(page.getByRole("status")).toHaveText("글 1편을 바꿨습니다.");

    // 고른 글은 같은 목록이 다시 그려지는 동안 남아 있으므로 작업마다 목록을 새로 연다.
    await page.goto(`/${owner.handle}/manage/posts?status=PUBLISHED`);
    await page.getByLabel(`${posts[1]} 선택`).check();
    await page.getByLabel("옮길 카테고리").selectOption({ label: category });
    await page.getByRole("button", { name: "옮기기", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("글 1편을 바꿨습니다.");

    await page.goto(`/${owner.handle}/manage/posts?status=PUBLISHED`);
    await page.getByLabel(`${posts[1]} 선택`).check();
    await page.getByRole("button", { name: "휴지통으로 옮기기" }).click();
    await expect(page.getByRole("status")).toHaveText("글 1편을 바꿨습니다.");
    await page.getByRole("link", { name: "휴지통" }).click();
    await page.getByRole("button", { name: `복구: ${posts[1]}` }).click();
    await expect(page.getByRole("status")).toHaveText("글을 복구했습니다.");

    await page.goto(`/${owner.handle}/manage/posts?visibility=PRIVATE`);
    await expect(
      page.getByRole("list", { name: "글 목록" }).getByRole("link", { name: posts[0] }),
    ).toBeVisible();
  });

  test("블로그 전환은 다른 블로그의 같은 메뉴로(#8)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/categories`);
    await page.getByRole("navigation", { name: "블로그 전환" }).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/${second}/manage/categories$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("다른 회원은 관리 화면 404·API 403, 관리 화면 응답은 noindex(#9, FR-097·098)", async ({
    browser,
    page,
  }) => {
    await logIn(page, owner);
    const response = await page.goto(`/${owner.handle}/manage/posts`);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

    const context = await newGuestContext(browser);
    const stranger = await context.newPage();
    await signUp(stranger, newAccount("mv"));
    const denied = await stranger.goto(`/${owner.handle}/manage`);
    expect(denied?.status()).toBe(404);
    expect(denied?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect((await stranger.goto(`/${owner.handle}/manage/posts`))?.status()).toBe(404);
    const api = await callApi(stranger.request, "GET", `/blogs/${owner.handle}/manage/dashboard`);
    expect(api.status).toBe(403);
    const blog = await stranger.goto(`/${owner.handle}`);
    expect(blog?.headers()["x-robots-tag"]).toBeUndefined();
    await context.close();
  });
});
