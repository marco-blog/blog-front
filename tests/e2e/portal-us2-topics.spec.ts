import { expect, test } from "@playwright/test";

import {
  callApi,
  logOut,
  newAccount,
  portalText,
  publishPost,
  requireBackend,
  requirePortalTestSettings,
  signUp,
  topicIdBySlug,
} from "./support/backend.js";

/**
 * 003 US2 주제 페이지 Independent Test(quickstart #11~14, T063): IT 인터넷 3편·모바일 4편을 발행하면 각 소분류 페이지에
 * 그 글만, 대분류 페이지에 모두 나온다(주제 없는 글은 없다). 인기순 전환, JS 없는 SSR, 없는 주제·부모가 다른 주소 404,
 * 메인 주제 탭에서 한 번에 대분류 페이지로 이동(SC-011).
 * backend를 포털 시험 설정으로 띄웠을 때만 돈다.
 */
test.describe("003 US2 주제 페이지", () => {
  requireBackend();
  requirePortalTestSettings();
  test.describe.configure({ mode: "serial" });

  const writer = newAccount("pt");
  const run = writer.handle.slice(-6);
  const itTitle = (n: number) => `주제${run} IT 인터넷 ${n}`;
  const mobileTitle = (n: number) => `주제${run} 모바일 ${n}`;
  const noTopicTitle = `주제${run} 주제 없는 글`;

  test("IT 인터넷 3편·모바일 4편 → 소분류·대분류 페이지(#11)", async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page, writer);
    const itInternet = await topicIdBySlug(page.request, "it-internet");
    const mobile = await topicIdBySlug(page.request, "mobile");
    for (let n = 1; n <= 3; n += 1) {
      await publishPost(page.request, writer.handle, {
        title: itTitle(n),
        contentMarkdown: portalText(4, `it-${n}`),
        topicId: itInternet,
      });
    }
    for (let n = 1; n <= 4; n += 1) {
      await publishPost(page.request, writer.handle, {
        title: mobileTitle(n),
        contentMarkdown: portalText(4, `mobile-${n}`),
        topicId: mobile,
      });
    }
    await publishPost(page.request, writer.handle, {
      title: noTopicTitle,
      contentMarkdown: portalText(4, "none"),
    });
    await logOut(page);

    // 발행 API가 topicId를 받아 글에 주제가 붙는다(003 US3).
    const listed = await callApi<Array<{ title: string }>>(
      page.request,
      "GET",
      "/topics/it-internet/posts?size=50",
    );
    expect(listed.status).toBe(200);
    expect(listed.body.result.map((card) => card.title)).toEqual(
      expect.arrayContaining([itTitle(1), itTitle(2), itTitle(3)]),
    );

    await page.goto("/topics/knowledge/it-internet");
    await expect(page.getByRole("heading", { level: 1, name: "IT 인터넷" })).toBeVisible();
    for (let n = 1; n <= 3; n += 1) {
      await expect(page.getByRole("heading", { name: itTitle(n) })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: mobileTitle(1) })).toHaveCount(0);

    await page.goto("/topics/knowledge/mobile");
    for (let n = 1; n <= 4; n += 1) {
      await expect(page.getByRole("heading", { name: mobileTitle(n) })).toBeVisible();
    }

    await page.goto("/topics/knowledge");
    // 블로그당 2편 제한은 메인 영역에만 있다. 주제 페이지는 주제의 글을 모두 보여준다.
    for (const title of [itTitle(3), mobileTitle(4)]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    expect(await page.content()).not.toContain(noTopicTitle);
  });

  test("메인 주제 탭에서 한 번에 대분류 페이지로, 소분류 탭과 정렬 전환(#12, SC-011)", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "주제" })
      .getByRole("link", { name: "지식·동향" })
      .click();
    await expect(page).toHaveURL(/\/topics\/knowledge$/);
    await expect(page.getByRole("heading", { level: 1, name: "지식·동향" })).toBeVisible();

    const subtopics = page.getByRole("navigation", { name: "소분류" });
    await expect(subtopics.getByRole("link", { name: "전체" })).toBeVisible();
    await subtopics.getByRole("link", { name: "IT 인터넷" }).click();
    await expect(page).toHaveURL(/\/topics\/knowledge\/it-internet$/);

    await page
      .getByRole("navigation", { name: "정렬" })
      .getByRole("link", { name: "인기순" })
      .click();
    await expect(page).toHaveURL(/\/topics\/knowledge\/it-internet\?sort=popular/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    // 최근 7일 반응이 없으면 안내, 있으면 목록
    await expect(
      page
        .getByText("최근 7일 동안 반응을 얻은 글이 없습니다. 최신순으로 둘러보세요.")
        .or(page.locator(".portal-card").first()),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "정렬" })
      .getByRole("link", { name: "최신순" })
      .click();
    await expect(page).toHaveURL(/\/topics\/knowledge\/it-internet$/);
  });

  test("JS 없이도 주제 이름·목록·meta가 HTML에 있다(#13)", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "ko-KR" });
    const page = await context.newPage();
    const response = await page.goto("/topics/knowledge/it-internet");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "IT 인터넷" })).toBeVisible();
    await expect(page).toHaveTitle(/^IT 인터넷 - /);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "IT 인터넷 주제의 글을 모아 봅니다.",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      /\/topics\/knowledge\/it-internet$/,
    );
    await expect(page.getByRole("navigation", { name: "소분류" })).toBeVisible();
    await context.close();
  });

  test("없는 주제·부모가 다른 소분류·대분류 자리의 소분류는 404(#14)", async ({ request }) => {
    for (const path of [
      "/topics/no-such-topic",
      "/topics/life/it-internet",
      "/topics/it-internet",
      "/topics/knowledge/no-such-minor",
    ]) {
      const response = await request.get(path, { headers: { "Accept-Language": "ko" } });
      expect(response.status(), path).toBe(404);
    }
  });
});
