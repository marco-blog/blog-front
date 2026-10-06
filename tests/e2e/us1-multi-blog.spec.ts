import { expect, test, type Page } from "@playwright/test";

import {
  callApi,
  logIn,
  newAccount,
  PASSWORD,
  publishPost,
  requireBackend,
  signUp,
} from "./support/backend.js";

// 한 회원의 여러 블로그(quickstart #30·32). backend가 있어야 돈다(E2E_BACKEND_URL).
test.describe("US1 여러 블로그", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("m");
  const dev = `${owner.handle}-dev`;
  const life = `${owner.handle}-life`;

  async function createBlog(page: Page, handle: string) {
    await page.goto("/settings/blogs");
    await page.getByLabel("블로그 주소").fill(handle);
    await expect(page.getByText("사용할 수 있는 주소입니다.")).toBeVisible();
    await page.getByRole("button", { name: "만들기" }).click();
  }

  function blogItem(page: Page, handle: string) {
    return page
      .getByRole("listitem")
      .filter({ has: page.locator("code", { hasText: `/${handle}` }) });
  }

  test("블로그는 3개까지, 네 번째는 BLOG_LIMIT_EXCEEDED (#30)", async ({ page }) => {
    await signUp(page, owner);

    await createBlog(page, dev);
    await expect(page.getByRole("status")).toHaveText("블로그를 만들었습니다.");
    await expect(page.getByText("블로그 2 / 3")).toBeVisible();

    await createBlog(page, life);
    await expect(page.getByText("블로그 3 / 3")).toBeVisible();

    await page.getByLabel("블로그 주소").fill(`${owner.handle}-x`);
    await page.getByRole("button", { name: "만들기" }).click();
    await expect(page.getByRole("alert")).toHaveText("만들 수 있는 블로그 수를 넘었습니다.");
    await expect(page.getByText("블로그 3 / 3")).toBeVisible();
  });

  test("다른 블로그에서 발행한 글은 그 블로그에만 있다 (#30)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${dev}/write`);
    await expect(page.getByLabel("제목")).toBeVisible();

    const id = await publishPost(page.request, dev, {
      title: "개발 블로그 글",
      contentMarkdown: "dev 본문",
    });

    expect((await page.goto(`/${dev}/${id}`))?.status()).toBe(200);
    await page.goto(`/${dev}`);
    await expect(page.getByRole("link", { name: "개발 블로그 글" })).toBeVisible();
    await page.goto(`/${owner.handle}`);
    await expect(page.getByRole("link", { name: "개발 블로그 글" })).toHaveCount(0);
    expect((await page.goto(`/${owner.handle}/${id}`))?.status()).toBe(404);
  });

  test("블로그 삭제 후 404, 주소 재사용은 HANDLE_TAKEN, 마지막 블로그는 삭제 거부 (#32)", async ({
    page,
    browser,
  }) => {
    await logIn(page, owner);
    const lifePost = await publishPost(page.request, life, {
      title: "생활 글",
      contentMarkdown: "life",
    });

    await page.goto("/settings/blogs");
    const item = blogItem(page, life);
    await item.getByText("블로그 삭제").click();
    await item.getByLabel("비밀번호 확인").fill(PASSWORD);
    await item.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그를 삭제했습니다.");

    expect((await page.goto(`/${life}`))?.status()).toBe(404);
    expect((await page.goto(`/${life}/${lifePost}`))?.status()).toBe(404);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/signup");
    await otherPage.getByLabel("블로그 주소").fill(life);
    await expect(otherPage.getByText("이미 사용 중인 주소입니다.")).toBeVisible();
    await other.close();

    for (const handle of [dev]) {
      const deleted = await callApi(page.request, "DELETE", `/blogs/${handle}`, {
        password: PASSWORD,
      });
      expect(deleted.status).toBe(200);
    }
    const last = await callApi(page.request, "DELETE", `/blogs/${owner.handle}`, {
      password: PASSWORD,
    });
    expect(last.status).toBe(409);
    expect(last.body.header.resultCode).toBe("LAST_BLOG_CANNOT_BE_DELETED");

    await page.goto("/settings/blogs");
    await expect(page.getByText("블로그 1 / 3")).toBeVisible();
    await expect(page.getByText("블로그 삭제")).toHaveCount(0);
  });
});
