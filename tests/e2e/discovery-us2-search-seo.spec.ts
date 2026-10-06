import { expect, test } from "@playwright/test";

import {
  callApi,
  logIn,
  logOut,
  newAccount,
  publishPost,
  requireBackend,
  signUp,
} from "./support/backend.js";

/**
 * 영어 불용어 a·i가 들어간 2-gram은 MySQL ngram FULLTEXT 색인에 들어가지 않으므로 그 두 글자를 뺀 낱말을 쓴다
 * (blog-backend docs/operations.md 5.1). 실행마다 새 낱말이라 다른 실행의 글과 섞이지 않는다.
 */
function uniqueWord(): string {
  const letters = "bcdfghjklmnopqrstuvwxyz";
  return Array.from({ length: 10 }, () => letters[Math.floor(Math.random() * letters.length)]).join(
    "",
  );
}

/**
 * 002 US2 검색·검색 엔진 Independent Test(quickstart #15, #17~19, T067): 공개 3·비공개 1 → 검색 결과에 공개 글만,
 * 휴지통으로 옮긴 글은 빠짐, JS 없이도 글 상세 HTML에 제목·본문·description, robots.txt·사이트맵에 공개 글만.
 * 검색은 MySQL FULLTEXT가 필요하므로 backend(MySQL)가 있을 때만 돈다(E2E_BACKEND_URL).
 */
test.describe("002 US2 검색·검색 엔진", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("sr");
  const word = uniqueWord();
  const ids: Record<string, number> = {};

  test("공개 3·비공개 1 → 상단 검색창으로 찾으면 공개 글만 최신순(quickstart #15)", async ({
    page,
  }) => {
    await signUp(page, owner);
    for (const title of ["첫째", "둘째", "셋째"]) {
      ids[title] = await publishPost(page.request, owner.handle, {
        title: `${title} ${word}`,
        contentMarkdown: `${title} 글의 본문입니다.`,
      });
    }
    ids.private = await publishPost(page.request, owner.handle, {
      title: `비공개 ${word}`,
      contentMarkdown: "비공개 본문",
      visibility: "PRIVATE",
    });
    await logOut(page);

    await page.goto("/");
    // 상단(banner)의 검색창. /search 화면에는 본문에도 검색창이 있다.
    const search = page.getByRole("banner").getByRole("search");
    await search.getByRole("searchbox", { name: "검색어" }).fill(word);
    await search.getByRole("button", { name: "검색" }).click();

    await expect(page).toHaveURL(new RegExp(`/search\\?q=${word}$`));
    await expect(page).toHaveTitle(`"${word}" 검색 - 블로그`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    const results = page.getByRole("region", { name: "검색 결과" });
    await expect(results.getByText("검색 결과 3건")).toBeVisible();
    await expect(results.getByRole("heading", { level: 2 })).toHaveText([
      `셋째 ${word}`,
      `둘째 ${word}`,
      `첫째 ${word}`,
    ]);
    await expect(page.getByText(`비공개 ${word}`)).toHaveCount(0);
    await expect(
      results
        .getByRole("article")
        .first()
        .getByRole("link", { name: `셋째 ${word}` }),
    ).toHaveAttribute("href", `/${owner.handle}/${ids["셋째"]}`);
    // 상단 검색창에 지금 검색어가 채워진다.
    await expect(search.getByRole("searchbox", { name: "검색어" })).toHaveValue(word);
  });

  test("검색어가 짧으면 입력란 문구, 결과가 없으면 안내", async ({ page }) => {
    await page.goto("/search?q=x");
    await expect(page.getByText("2자 이상 입력해 주세요.")).toBeVisible();
    await page.goto(`/search?q=${uniqueWord()}`);
    await expect(page.getByText("검색 결과가 없습니다. 다른 낱말로 찾아보세요.")).toBeVisible();
  });

  test("휴지통으로 옮긴 글은 결과에서 빠진다(quickstart #15)", async ({ page }) => {
    await logIn(page, owner);
    const trashed = await callApi(page.request, "DELETE", `/posts/${ids["둘째"]}`);
    expect(trashed.status).toBe(200);
    await logOut(page);

    await page.goto(`/search?q=${word}`);
    const results = page.getByRole("region", { name: "검색 결과" });
    await expect(results.getByRole("heading", { level: 2 })).toHaveText([
      `셋째 ${word}`,
      `첫째 ${word}`,
    ]);
  });

  test("JS 없이도 글 상세 HTML에 제목·본문·description(quickstart #17)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "ko-KR" });
    const page = await context.newPage();
    await page.goto(`/${owner.handle}/${ids["첫째"]}`);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`첫째 ${word}`);
    await expect(page.getByText("첫째 글의 본문입니다.")).toBeVisible();
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "첫째 글의 본문입니다.",
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      `첫째 ${word}`,
    );
    await context.close();
  });

  test("robots.txt·사이트맵에 공개 글만(quickstart #18~19)", async ({ page }) => {
    const robots = await page.request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(robots.headers()["content-type"]).toContain("text/plain");
    const rules = await robots.text();
    expect(rules).toContain("User-agent: *");
    expect(rules).toContain("Disallow: /api/");
    expect(rules).toContain("Disallow: /search$");
    expect(rules).toMatch(/Sitemap: \S+\/sitemap\.xml/);

    const index = await page.request.get("/sitemap.xml");
    expect(index.status()).toBe(200);
    expect(index.headers()["content-type"]).toContain("application/xml");
    const indexXml = await index.text();
    expect(indexXml).toContain("<sitemapindex");
    expect(indexXml).toContain("/sitemap/pages.xml</loc>");
    expect(indexXml).toContain("/sitemap/posts-1.xml</loc>");

    const pages = await (await page.request.get("/sitemap/pages.xml")).text();
    expect(pages).toContain(`/${owner.handle}</loc>`);

    const postsXml = await (await page.request.get("/sitemap/posts-1.xml")).text();
    expect(postsXml).toContain(`/${owner.handle}/${ids["첫째"]}</loc>`);
    expect(postsXml).toContain(`/${owner.handle}/${ids["셋째"]}</loc>`);
    expect(postsXml).not.toContain(`/${owner.handle}/${ids.private}</loc>`);
    expect(postsXml).not.toContain(`/${owner.handle}/${ids["둘째"]}</loc>`);
  });
});
