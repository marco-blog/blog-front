import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  callApi,
  logIn,
  logOut,
  newAccount,
  publishPost,
  requireBackend,
  signUp,
} from "./support/backend.js";

/** XML 문자열에서 태그 안의 글자(첫 단계만, 테스트용) */
function texts(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map(
    (match) => match[1],
  );
}

/** RSS의 글 제목들(채널 제목 제외) */
function rssItemTitles(xml: string): string[] {
  return texts(xml, "item").flatMap((item) => texts(item, "title"));
}

/** Atom의 글 제목들(피드 제목 제외) */
function atomEntryTitles(xml: string): string[] {
  return texts(xml, "entry").flatMap((entry) => texts(entry, "title"));
}

async function getFeed(request: APIRequestContext, path: string, headers = {}) {
  const response = await request.get(path, { headers });
  return { response, body: response.status() === 200 ? await response.text() : "" };
}

/**
 * 002 US3 RSS·Atom Independent Test(quickstart #24~28, #31, T090): 공개 3·비공개 1·임시저장 1 → RSS·Atom에 공개 3편,
 * 요약·10개 설정 반영, 카테고리 RSS, ETag 304 → 비공개 전환 뒤 200에서 빠짐, 화면 `<head>`의 자동 발견 링크, 없는 블로그 404.
 * backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("002 US3 RSS·Atom", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("rs");
  const ids: number[] = [];

  test("공개 3·비공개 1·임시저장 1 → RSS·Atom에 공개 3편만 최신순(quickstart #24~25)", async ({
    page,
  }) => {
    await signUp(page, owner);
    for (const title of ["첫 글", "둘째 글", "셋째 글"]) {
      ids.push(
        await publishPost(page.request, owner.handle, {
          title,
          contentMarkdown: `${title}의 **본문**입니다.`,
        }),
      );
    }
    await publishPost(page.request, owner.handle, {
      title: "비공개 글",
      contentMarkdown: "비공개",
      visibility: "PRIVATE",
    });
    const draft = await callApi(page.request, "POST", `/blogs/${owner.handle}/posts/drafts`, {
      title: "임시저장 글",
      contentMarkdown: "임시",
    });
    expect(draft.status).toBe(201);
    await logOut(page);

    const rss = await getFeed(page.request, `/${owner.handle}/rss`);
    expect(rss.response.status()).toBe(200);
    expect(rss.response.headers()["content-type"]).toContain("application/rss+xml");
    expect(rss.response.headers()["cache-control"]).toBe("no-cache");
    expect(rssItemTitles(rss.body)).toEqual(["셋째 글", "둘째 글", "첫 글"]);
    expect(rss.body).not.toContain("비공개 글");
    expect(rss.body).not.toContain("임시저장 글");
    // FULL(기본): 본문 HTML
    expect(rss.body).toContain("&lt;strong&gt;본문&lt;/strong&gt;");

    const atom = await getFeed(page.request, `/${owner.handle}/atom`);
    expect(atom.response.status()).toBe(200);
    expect(atom.response.headers()["content-type"]).toContain("application/atom+xml");
    expect(atomEntryTitles(atom.body)).toEqual(["셋째 글", "둘째 글", "첫 글"]);
  });

  test("피드 설정 화면에서 요약·10개로 바꾸면 피드에 반영된다(quickstart #26)", async ({
    page,
  }) => {
    await logIn(page, owner);
    for (let i = 4; i <= 12; i++) {
      ids.push(
        await publishPost(page.request, owner.handle, {
          title: `글 ${i}`,
          contentMarkdown: `글 ${i}의 **본문**입니다.`,
        }),
      );
    }
    await page.goto(`/${owner.handle}/manage`);
    await page
      .getByRole("navigation", { name: "블로그 관리 메뉴" })
      .getByRole("link", { name: "피드 설정" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage/feed$`));
    const urls = page.getByRole("region", { name: "피드 주소" });
    await expect(urls.getByRole("link", { name: /\/rss$/ })).toHaveAttribute(
      "href",
      new RegExp(`/${owner.handle}/rss$`),
    );
    await page.getByRole("combobox", { name: "피드에 담을 글 수" }).selectOption("10");
    await page.getByRole("radio", { name: "요약" }).check();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("피드 설정을 저장했습니다.");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "피드에 담을 글 수" })).toHaveValue("10");
    await expect(page.getByRole("radio", { name: "요약" })).toBeChecked();
    await logOut(page);

    const rss = await getFeed(page.request, `/${owner.handle}/rss`);
    const titles = rssItemTitles(rss.body);
    expect(titles).toHaveLength(10);
    expect(titles[0]).toBe("글 12");
    expect(rss.body).not.toContain("&lt;strong&gt;");
    expect(rss.body).toContain("글 12의 본문입니다.");
    expect(
      atomEntryTitles((await getFeed(page.request, `/${owner.handle}/atom`)).body),
    ).toHaveLength(10);
  });

  test("카테고리 RSS에는 그 카테고리 글만(quickstart #27)", async ({ page }) => {
    await logIn(page, owner);
    const category = await callApi<{ id: number }>(
      page.request,
      "POST",
      `/blogs/${owner.handle}/categories`,
      { name: "Spring", parentId: null },
    );
    expect(category.status).toBe(201);
    const draft = await callApi<{ id: number }>(
      page.request,
      "POST",
      `/blogs/${owner.handle}/posts/drafts`,
      {
        title: "카테고리 글",
        contentMarkdown: "카테고리 본문",
        categoryId: category.body.result.id,
      },
    );
    await callApi(page.request, "POST", `/posts/${draft.body.result.id}/publish`, {
      visibility: "PUBLIC",
      commentEnabled: true,
    });
    await logOut(page);

    const rss = await getFeed(
      page.request,
      `/${owner.handle}/category/${category.body.result.id}/rss`,
    );
    expect(rss.response.status()).toBe(200);
    expect(rssItemTitles(rss.body)).toEqual(["카테고리 글"]);
    expect(texts(rss.body, "title")[0]).toContain("Spring - ");
  });

  test("ETag가 같으면 304, 글을 비공개로 바꾸면 200에서 빠진다(quickstart #28)", async ({
    page,
  }) => {
    const first = await getFeed(page.request, `/${owner.handle}/rss`);
    const etag = first.response.headers()["etag"];
    expect(etag).toMatch(/^W\/"/);
    expect(first.response.headers()["last-modified"]).toBeTruthy();
    const cached = await page.request.get(`/${owner.handle}/rss`, {
      headers: { "If-None-Match": etag },
    });
    expect(cached.status()).toBe(304);
    expect(await cached.text()).toBe("");

    await logIn(page, owner);
    const newest = ids.at(-1)!;
    const changed = await callApi(page.request, "POST", `/posts/${newest}/publish`, {
      visibility: "PRIVATE",
      commentEnabled: true,
    });
    expect(changed.status).toBe(200);
    await logOut(page);

    const after = await getFeed(page.request, `/${owner.handle}/rss`, { "If-None-Match": etag });
    expect(after.response.status()).toBe(200);
    expect(after.response.headers()["etag"]).not.toBe(etag);
    expect(rssItemTitles(after.body)).not.toContain("글 12");
  });

  test("화면 <head>의 RSS·Atom 자동 발견 링크(quickstart #31)", async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? "").origin;
    await page.goto(`/${owner.handle}`);
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
      "href",
      `${origin}/${owner.handle}/rss`,
    );
    await expect(
      page.locator('link[rel="alternate"][type="application/atom+xml"]'),
    ).toHaveAttribute("href", `${origin}/${owner.handle}/atom`);

    await page.goto(`/${owner.handle}/${ids[0]}`);
    await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute(
      "title",
      `${owner.nickname}의 블로그 RSS`,
    );
  });

  test("없는 블로그의 피드는 404", async ({ page }) => {
    const missing = await page.request.get(`/${newAccount("zz").handle}/rss`);
    expect(missing.status()).toBe(404);
    expect((await page.request.get(`/${newAccount("zz").handle}/atom`)).status()).toBe(404);
  });
});
