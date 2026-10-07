import { expect, test } from "@playwright/test";

import {
  callApi,
  logIn,
  newAccount,
  publishPost,
  requireBackend,
  signUp,
} from "./support/backend.js";

// 블로그 관리 뼈대(quickstart #16·29). backend가 있어야 돈다(E2E_BACKEND_URL).
test.describe("US1 블로그 관리", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("g");
  const titles = ["관리 글 하나", "관리 글 둘", "관리 글 셋"];

  test("/manage → 대시보드, 글 3편을 골라 비공개로 일괄 변경 (#29)", async ({ page }) => {
    await signUp(page, owner);
    for (const title of titles) {
      await publishPost(page.request, owner.handle, { title, contentMarkdown: `${title} 본문` });
    }
    const draft = await callApi<{ id: number }>(
      page.request,
      "POST",
      `/blogs/${owner.handle}/posts/drafts`,
      { title: "쓰다 만 글", contentMarkdown: "아직" },
    );
    expect(draft.status).toBe(201);

    await page.goto("/manage");
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage$`));
    await expect(page.getByRole("heading", { name: "대시보드" })).toBeVisible();
    await expect(page.getByRole("link", { name: "1편" })).toBeVisible();
    await expect(page.getByRole("link", { name: "관리 글 셋" })).toBeVisible();
    await expect(page.getByText("아직 댓글이 없습니다.")).toBeVisible();
    // 004부터 대시보드에 오늘·어제 방문자가 나온다(FR-067).
    await expect(page.getByText("오늘 방문자")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");

    await page
      .getByRole("navigation", { name: "블로그 관리 메뉴" })
      .getByRole("link", { name: "글 관리" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage/posts$`));
    for (const title of titles) {
      await page.getByLabel(`${title} 선택`).check();
    }
    await page.getByRole("button", { name: "비공개로 바꾸기" }).click();
    await expect(page.getByRole("status")).toHaveText("글 3편을 바꿨습니다.");

    await page.goto(`/${owner.handle}/manage/posts?visibility=PRIVATE`);
    const list = page.getByRole("list", { name: "글 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await page.goto(`/${owner.handle}`);
    await expect(page.getByRole("main").getByText("아직 발행한 글이 없습니다.")).toBeVisible();
  });

  test("휴지통으로 옮긴 글을 복구하면 삭제 전 상태·공개 범위로 돌아온다 (#16)", async ({
    page,
  }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/posts?status=PUBLISHED`);
    await page.getByLabel(`${titles[0]} 선택`).check();
    await page.getByRole("button", { name: "휴지통으로 옮기기" }).click();
    await expect(page.getByRole("status")).toHaveText("글 1편을 바꿨습니다.");
    await expect(page.getByRole("link", { name: titles[0] })).toHaveCount(0);

    await page.getByRole("link", { name: "휴지통" }).click();
    await expect(page).toHaveURL(/status=DELETED/);
    await expect(page.getByText(/에 영구 삭제/)).toBeVisible();
    await page.getByRole("button", { name: `복구: ${titles[0]}` }).click();
    await expect(page.getByRole("status")).toHaveText("글을 복구했습니다.");
    await expect(page.getByText("휴지통이 비어 있습니다.")).toBeVisible();

    await page.goto(`/${owner.handle}/manage/posts?status=PUBLISHED&visibility=PRIVATE`);
    await expect(page.getByRole("link", { name: titles[0] })).toBeVisible();
  });

  test("블로그 설정을 바꾸면 블로그 홈에 보인다", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/settings`);
    await page.getByLabel("블로그 제목").fill("관리하는 블로그");
    await page.getByLabel("블로그 소개").fill("관리 화면에서 바꾼 소개");
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 설정을 저장했습니다.");

    await page.goto(`/${owner.handle}`);
    await expect(page.getByRole("heading", { name: "관리하는 블로그" })).toBeVisible();
    await expect(page.getByRole("main").getByText("관리 화면에서 바꾼 소개")).toBeVisible();
  });

  test("남의 블로그 관리 화면은 404, API는 403", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const stranger = newAccount("h");
    await signUp(page, stranger);

    expect((await page.goto(`/${owner.handle}/manage`))?.status()).toBe(404);
    expect((await page.goto(`/${owner.handle}/manage/posts`))?.status()).toBe(404);
    const api = await callApi(page.request, "GET", `/blogs/${owner.handle}/manage/dashboard`);
    expect(api.status).toBe(403);
    const bulk = await callApi(
      page.request,
      "POST",
      `/blogs/${stranger.handle}/manage/posts/bulk`,
      {
        postIds: [1],
        action: "DELETE",
      },
    );
    expect(bulk.status).toBe(403);
    await context.close();
  });
});
