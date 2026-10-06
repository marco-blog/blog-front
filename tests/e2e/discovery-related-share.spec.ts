import { expect, test, type APIRequestContext } from "@playwright/test";

import { callApi, logOut, newAccount, requireBackend, signUp } from "./support/backend.js";

/** 카테고리·태그를 담아 임시저장 후 발행한다(API). */
async function publishClassified(
  request: APIRequestContext,
  handle: string,
  post: { title: string; categoryId: number | null; tags: string[] },
) {
  const draft = await callApi<{ id: number }>(request, "POST", `/blogs/${handle}/posts/drafts`, {
    title: post.title,
    contentMarkdown: `${post.title} 본문`,
    categoryId: post.categoryId,
    tags: post.tags,
  });
  expect(draft.status).toBe(201);
  const published = await callApi(request, "POST", `/posts/${draft.body.result.id}/publish`, {
    visibility: "PUBLIC",
    commentEnabled: true,
  });
  expect(published.status).toBe(200);
  return draft.body.result.id;
}

async function createCategory(request: APIRequestContext, handle: string, name: string) {
  const created = await callApi<{ id: number }>(request, "POST", `/blogs/${handle}/categories`, {
    name,
    parentId: null,
  });
  expect(created.status).toBe(201);
  return created.body.result.id;
}

/**
 * 관련 글·공유(002 FR-068·069, quickstart #21~23, T078): 점수(겹치는 태그 수 + 같은 카테고리 1)·발행 최신순·점수 0 제외,
 * 주소 복사(클립보드), X·페이스북 링크, og 메타. `BLOG_KAKAO_JS_KEY`가 없는 E2E에서는 카카오톡 버튼이 없는지만 본다.
 * backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("002 관련 글·공유", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("rl");
  const java = `j${owner.handle.slice(-8)}`;
  const jpa = `p${owner.handle.slice(-8)}`;
  let xPath = "";

  test("관련 글: Z(태그 2) → W(같은 카테고리) → Y(태그 1), 겹침 없는 V와 자신은 없다(quickstart #21)", async ({
    page,
  }) => {
    await signUp(page, owner);
    const spring = await createCategory(page.request, owner.handle, "Spring");
    const other = await createCategory(page.request, owner.handle, "Other");
    const x = await publishClassified(page.request, owner.handle, {
      title: "X 기준 글",
      categoryId: spring,
      tags: [java, jpa],
    });
    await publishClassified(page.request, owner.handle, {
      title: "Y 글",
      categoryId: other,
      tags: [java],
    });
    await publishClassified(page.request, owner.handle, {
      title: "Z 글",
      categoryId: other,
      tags: [jpa, java],
    });
    await publishClassified(page.request, owner.handle, {
      title: "W 글",
      categoryId: spring,
      tags: [],
    });
    await publishClassified(page.request, owner.handle, {
      title: "V 글",
      categoryId: other,
      tags: [`d${owner.handle.slice(-8)}`],
    });
    xPath = `/${owner.handle}/${x}`;
    await logOut(page);

    await page.goto(xPath);
    const related = page.getByRole("region", { name: "관련 글" });
    await expect(related.getByRole("link")).toHaveText(["Z 글", "W 글", "Y 글"]);
    await expect(related.getByRole("link", { name: "V 글" })).toHaveCount(0);
    await expect(related.getByRole("link", { name: "X 기준 글" })).toHaveCount(0);
  });

  test("공유: 주소 복사, X·페이스북 새 창 링크, 키가 없으면 카카오톡 버튼 없음(quickstart #22)", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(xPath);
    const url = new URL(xPath, baseURL).toString();
    const share = page.getByRole("region", { name: "공유하기" });

    await share.getByRole("button", { name: "주소 복사" }).click();
    await expect(share.getByRole("status")).toHaveText("주소를 복사했습니다.");
    // E2E tsconfig에는 DOM 타입이 없어 브라우저 객체 모양만 적는다.
    const clipboardText = await page.evaluate(() =>
      (
        globalThis as unknown as { navigator: { clipboard: { readText(): Promise<string> } } }
      ).navigator.clipboard.readText(),
    );
    expect(clipboardText).toBe(url);

    const x = share.getByRole("link", { name: "X" });
    await expect(x).toHaveAttribute("target", "_blank");
    await expect(x).toHaveAttribute("rel", "noopener noreferrer");
    const xHref = new URL((await x.getAttribute("href")) ?? "");
    expect(xHref.origin + xHref.pathname).toBe("https://x.com/intent/tweet");
    expect(xHref.searchParams.get("url")).toBe(url);
    expect(xHref.searchParams.get("text")).toBe("X 기준 글");
    const facebook = new URL(
      (await share.getByRole("link", { name: "페이스북" }).getAttribute("href")) ?? "",
    );
    expect(facebook.searchParams.get("u")).toBe(url);

    await expect(share.getByRole("button", { name: "카카오톡" })).toHaveCount(0);
  });

  test("og 메타와 대표 이미지가 없을 때 twitter:card=summary(quickstart #23)", async ({
    page,
    baseURL,
  }) => {
    await page.goto(xPath);
    const url = new URL(xPath, baseURL).toString();
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "X 기준 글");
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", url);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      "content",
      "X 기준 글 본문",
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary");
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(0);
  });
});
