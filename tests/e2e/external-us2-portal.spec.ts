import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  adminRequest,
  callApi,
  newAccount,
  newGuestContext,
  requireAdmin,
  requireBackend,
  requireExternalTestSettings,
  signUp,
  topicIdBySlug,
} from "./support/backend.js";
import {
  addItem,
  hits,
  stubFeed,
  stubPostUrl,
  stubUrl,
  uniqueStubName,
  type StubBlog,
} from "./support/feedStub.js";

const MINUTE = 60 * 1000;

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

interface AdminPost {
  id: number;
  title: string;
  clickCount: number;
  thumbnailUrl: string | null;
}

/** 관리자 API로 그 등록의 수집된 글(최신순)을 기다린다. 스케줄러는 2초마다 고르고 5초마다 수집한다. */
async function waitForPosts(admin: APIRequestContext, blogId: number, count: number) {
  let posts: AdminPost[] = [];
  await expect
    .poll(
      async () => {
        const response = await callApi<AdminPost[]>(
          admin,
          "GET",
          `/admin/external-blogs/${blogId}/posts?size=50`,
        );
        posts = response.status === 200 ? response.body.result : [];
        return posts.length;
      },
      { timeout: 60_000, intervals: [2_000, 3_000, 5_000] },
    )
    .toBeGreaterThanOrEqual(count);
  return posts;
}

/** 최신 글 영역에서 그 외부 블로그의 카드 */
function externalCards(page: Page, blogTitle: string) {
  return page
    .getByRole("region", { name: "최신 글" })
    .locator('article[data-source="EXTERNAL"]')
    .filter({ hasText: blogTitle });
}

/**
 * 007 US2 포털에 외부 글 노출(quickstart #12~#19, T052). 피드는 E2E 스텁 서버(127.0.0.1:4610)가 준다.
 * 관리자가 스텁 피드를 기본 주제 IT 인터넷으로 직접 등록 → 주제 페이지에 "외부" 카드 → 클릭하면 새 탭이 원문 주소, 관리자 화면 클릭 수 1 →
 * 같은 피드 새 글 4편이어도 메인 최신에는 블로그당 2편 → 출처 필터 → 소유 인증 없는 블로그 카드는 썸네일 없음·스텁 이미지 요청 0건,
 * 인증된 블로그 카드는 `/media/external/…` 이미지(200) → 검색에 외부 글 없음.
 * 매핑 규칙으로 다른 주제에 들어가는 경우는 규칙 화면(US3)과 함께 external-us3 시나리오가 확인한다. 원문이 사라진 뒤의 링크 점검은
 * 주 1회 작업이라 E2E에서 기다리지 않고 backend 시험(LinkCheckJobTest)이 확인한다.
 */
test.describe("007 US2 포털 외부 글", () => {
  requireBackend();
  requireAdmin();
  requireExternalTestSettings();
  test.describe.configure({ mode: "serial" });

  const member = newAccount("xp");
  const run = member.handle.slice(-6);
  const feedX = uniqueStubName("xp");
  const feedV = uniqueStubName("xv");
  const blogX: StubBlog = {
    title: `X 블로그 ${run}`,
    items: [{ n: 1, title: `외부 첫 글 ${run}`, publishedAt: minutesAgo(30), image: true }],
  };
  const blogV: StubBlog = { title: `V 블로그 ${run}`, items: [] };
  let admin: APIRequestContext;
  let itTopicId = 0;
  let blogXId = 0;

  test.beforeAll(async ({ playwright }) => {
    admin = await adminRequest(playwright);
    itTopicId = await topicIdBySlug(admin, "it-internet");
    await stubFeed(feedX, blogX);
    const created = await callApi<{ id: number }>(admin, "POST", "/admin/external-blogs", {
      feedUrl: stubUrl(feedX),
      defaultTopicId: itTopicId,
      registrationBasis: `E2E 스텁 피드 ${run}`,
    });
    expect(created.status, "관리자 직접 등록").toBe(201);
    blogXId = created.body.result.id;
    await waitForPosts(admin, blogXId, 1);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("주제 페이지의 외부 카드를 누르면 새 탭에 원문, 클릭 수 1", async ({ browser }) => {
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await page.goto("/topics/knowledge/it-internet");
    const card = page
      .locator('article[data-source="EXTERNAL"]')
      .filter({ hasText: `외부 첫 글 ${run}` });
    await expect(card).toHaveCount(1);
    await expect(card.locator(".portal-card-badge")).toHaveText("외부");
    await expect(card).toContainText(blogX.title!);
    await expect(card).toContainText("127.0.0.1");
    await expect(card).not.toContainText("좋아요");
    // 소유 인증 없는 블로그: 썸네일 없이 주제 색, 스텁 이미지는 한 번도 받지 않음
    await expect(card.locator("img")).toHaveCount(0);
    await expect(card.getByTestId("portal-card-placeholder")).toBeVisible();
    expect((await hits(feedX))[`/${feedX}/img/1.png`] ?? 0).toBe(0);

    const link = card.getByRole("link", { name: new RegExp(`외부 첫 글 ${run}`) });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener nofollow");
    const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
    await popup.waitForLoadState();
    expect(popup.url()).toBe(stubPostUrl(feedX, 1));

    await expect
      .poll(async () => (await waitForPosts(admin, blogXId, 1))[0]?.clickCount, {
        timeout: 10_000,
      })
      .toBe(1);
    await context.close();
  });

  test("메인 최신: 같은 피드 새 글 4편이어도 블로그당 2편, 출처 필터", async ({ browser }) => {
    for (let i = 0; i < 4; i++) {
      await addItem(feedX, {
        title: `외부 새 글 ${i + 1} ${run}`,
        publishedAt: minutesAgo(10 - i),
      });
    }
    await waitForPosts(admin, blogXId, 5);

    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await page.goto("/");
    await expect(externalCards(page, blogX.title!)).toHaveCount(2);
    await expect(externalCards(page, blogX.title!).first()).toContainText(`외부 새 글 4 ${run}`);

    const latest = page.getByRole("region", { name: "최신 글" });
    const filter = latest.getByRole("navigation", { name: "출처" });
    await filter.getByRole("link", { name: "외부 글만" }).click();
    await expect(page).toHaveURL(/\?source=external$/);
    await expect(filter.getByRole("link", { name: "외부 글만" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(externalCards(page, blogX.title!)).toHaveCount(2);
    await expect(latest.locator('article:not([data-source="EXTERNAL"])')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await filter.getByRole("link", { name: "내부 글만" }).click();
    await expect(page).toHaveURL(/\?source=internal$/);
    await expect(latest.locator('article[data-source="EXTERNAL"]')).toHaveCount(0);

    await filter.getByRole("link", { name: "전체" }).click();
    await expect(externalCards(page, blogX.title!)).toHaveCount(2);

    // 주제 페이지 필터: 외부 글만이면 이 블로그 글 5편이 모두(블로그당 제한은 메인 최신만)
    await page.goto("/topics/knowledge/it-internet?source=external");
    await expect(
      page.locator('article[data-source="EXTERNAL"]').filter({ hasText: blogX.title! }),
    ).toHaveCount(5);
    await context.close();
  });

  test("소유 인증된 블로그의 카드는 /media/external 썸네일(200)", async ({ browser, request }) => {
    await stubFeed(feedV, blogV);
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await signUp(page, member);
    const api = page.request;

    const issued = await callApi<{ id: number; code: string }>(
      api,
      "POST",
      "/me/external-blog-verifications",
      { feedUrl: stubUrl(feedV) },
    );
    expect(issued.status).toBe(201);
    await stubFeed(feedV, {
      ...blogV,
      verifyCode: issued.body.result.code,
      items: [{ n: 1, title: `인증 블로그 글 ${run}`, publishedAt: minutesAgo(5), image: true }],
    });
    const checked = await callApi<{ verifiedAt: string | null }>(
      api,
      "POST",
      `/me/external-blog-verifications/${issued.body.result.id}/check`,
      { feedUrl: stubUrl(feedV) },
    );
    expect(checked.body.result.verifiedAt).toBeTruthy();
    const requested = await callApi<{ id: number }>(api, "POST", "/me/external-blogs", {
      feedUrl: stubUrl(feedV),
      defaultTopicId: itTopicId,
      verificationId: issued.body.result.id,
    });
    expect(requested.status).toBe(201);
    const blogVId = requested.body.result.id;
    expect(
      (await callApi(admin, "POST", `/admin/external-blogs/${blogVId}/approve`, {})).status,
    ).toBe(200);

    await expect
      .poll(async () => (await waitForPosts(admin, blogVId, 1))[0]?.thumbnailUrl ?? null, {
        timeout: 60_000,
        intervals: [2_000, 3_000],
      })
      .toMatch(/^\/media\/external\//);

    await page.goto("/?source=external");
    const card = externalCards(page, blogV.title!);
    await expect(card).toHaveCount(1);
    const src = await card.locator("img").getAttribute("src");
    expect(src).toMatch(/^\/media\/external\//);
    const image = await request.get(src!);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toMatch(/^image\//);
    expect((await hits(feedV))[`/${feedV}/img/1.png`]).toBeGreaterThanOrEqual(1);
    await context.close();
  });

  test("검색에는 외부 글이 나오지 않는다", async ({ browser }) => {
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await page.goto(`/search?q=${encodeURIComponent(`외부 ${run}`)}`);
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(`외부 첫 글 ${run}`);
    await expect(page.getByRole("main")).not.toContainText(`외부 새 글`);
    await context.close();
  });
});
