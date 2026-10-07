import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  adminAccount,
  adminRequest,
  callApi,
  logInWith,
  newAccount,
  newGuestContext,
  requireAdmin,
  requireBackend,
  requireExternalTestSettings,
  signUp,
} from "./support/backend.js";
import { stubFeed, stubUrl, uniqueStubName, type StubBlog } from "./support/feedStub.js";

/** 문서가 화면 너비보다 넓지 않다(가로 스크롤 없음). e2e 타입 설정에는 DOM 타입이 없어 코드를 문자열로 넘긴다. */
async function expectNoHorizontalScroll(page: Page) {
  const [scrollWidth, clientWidth] = (await page.evaluate(
    "[document.documentElement.scrollWidth, document.documentElement.clientWidth]",
  )) as [number, number];
  expect(scrollWidth, page.url()).toBeLessThanOrEqual(clientWidth);
}

async function itTopic(request: APIRequestContext) {
  const tree = await callApi<{ slug: string; children: { id: number; slug: string }[] }[]>(
    request,
    "GET",
    "/topics",
  );
  for (const major of tree.body.result) {
    const minor = major.children.find((child) => child.slug === "it-internet");
    if (minor) {
      return { id: minor.id, path: `/topics/${major.slug}/${minor.slug}` };
    }
  }
  throw new Error("it-internet 주제 없음");
}

/**
 * 007 모바일 화면(quickstart #40, T092): 360×740에서 신청 단계·상세·포털 외부 카드·출처 필터에 가로 스크롤이 없고, 관리자가 있으면
 * 콘솔 외부 블로그 목록·검수 표는 가로 스크롤 상자(`.table-scroll`) 안에 있어 화면 전체는 가로로 밀리지 않는다.
 */
test.describe("007 모바일 360×740", () => {
  requireBackend();
  requireExternalTestSettings();
  test.use({ viewport: { width: 360, height: 740 } });

  const long = "아주긴외부블로그제목".repeat(6);
  const longTitle = `모바일 외부 글 ${"가나다라마바사아자차".repeat(8)}`;

  test("신청 단계와 상세에 가로 스크롤이 없다", async ({ page }) => {
    const member = newAccount("xmo");
    const feed = uniqueStubName("xmo");
    const blog: StubBlog = {
      title: long,
      items: [{ n: 1, title: longTitle, summary: "요약".repeat(80) }],
    };
    await stubFeed(feed, blog);
    await signUp(page, member);

    await page.goto(`/${member.handle}/manage/external-blogs/new`);
    await expectNoHorizontalScroll(page);
    await page.getByLabel("블로그 주소 또는 피드 주소").fill(stubUrl(feed));
    await page.getByRole("button", { name: "미리보기" }).click();
    await expect(page.getByRole("region", { name: "찾은 블로그" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    await expect(page.locator(".verification-code")).toBeVisible();
    await expectNoHorizontalScroll(page);

    const topics = await itTopic(page.request);
    const created = await callApi<{ id: number }>(page.request, "POST", "/me/external-blogs", {
      feedUrl: stubUrl(feed),
      defaultTopicId: topics.id,
    });
    expect(created.status).toBe(201);
    await page.goto(`/${member.handle}/manage/external-blogs/${created.body.result.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "해제" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.goto(`/${member.handle}/manage/external-blogs`);
    await expectNoHorizontalScroll(page);
  });

  test("포털 외부 카드·출처 필터, 콘솔 외부 블로그 목록·검수 표", async ({
    browser,
    playwright,
  }) => {
    requireAdmin();
    test.setTimeout(120_000);
    const admin = await adminRequest(playwright);
    const topic = await itTopic(admin);
    const feed = uniqueStubName("xma");
    await stubFeed(feed, {
      title: long,
      items: [
        {
          n: 1,
          title: longTitle,
          summary: "요약".repeat(80),
          publishedAt: new Date(Date.now() - 60_000).toISOString(),
        },
      ],
    });
    const created = await callApi<{ id: number }>(admin, "POST", "/admin/external-blogs", {
      feedUrl: stubUrl(feed),
      defaultTopicId: topic.id,
      registrationBasis: "E2E 모바일 스텁 피드",
    });
    expect(created.status).toBe(201);
    await admin.dispose();

    const guest = await newGuestContext(browser);
    const portal = await guest.newPage();
    await portal.setViewportSize({ width: 360, height: 740 });
    const card = portal.locator('article[data-source="EXTERNAL"]').filter({ hasText: longTitle });
    await expect(async () => {
      await portal.goto(`${topic.path}?source=external`);
      await expect(card).toHaveCount(1, { timeout: 1_000 });
    }).toPass({ timeout: 60_000, intervals: [2_000, 3_000] });
    await expect(portal.getByRole("navigation", { name: "출처" })).toBeVisible();
    await expectNoHorizontalScroll(portal);
    await portal.goto("/?source=external");
    await expect(portal.getByRole("navigation", { name: "출처" })).toBeVisible();
    await expectNoHorizontalScroll(portal);
    await guest.close();

    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await page.setViewportSize({ width: 360, height: 740 });
    const { email, password } = adminAccount();
    await logInWith(page, email, password);
    await page.goto("/admin/external-blogs?status=ACTIVE");
    const list = page.getByRole("table", { name: "외부 블로그 관리" });
    await expect(list).toBeVisible();
    await expect(page.locator(".table-scroll").filter({ has: list })).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await page.goto("/admin/external-blogs/reviews");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const reviews = page.getByRole("table", { name: "분류 검수" });
    if ((await reviews.count()) > 0) {
      await expect(page.locator(".table-scroll").filter({ has: reviews })).toHaveCount(1);
    }
    await expectNoHorizontalScroll(page);
    await page.goto(`/admin/external-blogs/${created.body.result.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await context.close();
  });
});
