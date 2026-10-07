import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

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
  requireModerationTestSettings,
  signUp,
} from "./support/backend.js";
import { stubFeed, stubUrl, uniqueStubName } from "./support/feedStub.js";

interface TopicTree {
  id: number;
  slug: string;
  children: { id: number; slug: string }[];
}

interface ReportGroup {
  representativeId: number;
  channel: string;
  target: { id: number; title: string | null } | null;
}

async function itTopic(request: APIRequestContext) {
  const tree = await callApi<TopicTree[]>(request, "GET", "/topics");
  for (const major of tree.body.result) {
    const minor = major.children.find((child) => child.slug === "it-internet");
    if (minor) {
      return { id: minor.id, path: `/topics/${major.slug}/${minor.slug}` };
    }
  }
  throw new Error("it-internet 주제 없음");
}

/** 관리자 직접 등록한 스텁 피드의 글이 포털 IT 주제 외부 카드로 보일 때까지 기다린다. */
async function card(page: Page, path: string, title: string): Promise<Locator> {
  const article = page.locator('article[data-source="EXTERNAL"]').filter({ hasText: title });
  await expect(async () => {
    await page.goto(`${path}?source=external`);
    await expect(article).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 60_000, intervals: [2_000, 3_000] });
  return article;
}

/**
 * 007 US4 외부 글 "삭제 요청"(US4 AS3, quickstart #32, T079). 로그인 회원은 카드의 "삭제 요청"으로 005 신고 레이어(`EXTERNAL_POST`)를
 * 열어 신고하고, 관리자가 신고 상세에서 "포털에서 내림"으로 처리하면 포털에서 사라진다. 비로그인 사용자는 이동 주소가 채워진 권리 침해
 * 신고 화면으로 가고, 접수된 신고의 대상은 그 외부 글로 잡힌다.
 */
test.describe("007 US4 외부 글 삭제 요청", () => {
  requireBackend();
  requireAdmin();
  requireExternalTestSettings();
  requireModerationTestSettings();
  test.describe.configure({ mode: "serial" });

  const reporter = newAccount("xq");
  const run = reporter.handle.slice(-6);
  const memberTitle = `신고될 외부 글 ${run}`;
  const rightsTitle = `권리 침해 외부 글 ${run}`;
  let admin: APIRequestContext;
  let topic = { id: 0, path: "" };

  test.beforeAll(async ({ playwright }) => {
    admin = await adminRequest(playwright);
    topic = await itTopic(admin);
    const feed = uniqueStubName("xq");
    const now = Date.now();
    await stubFeed(feed, {
      title: `Q ${run}`,
      items: [
        {
          n: 1,
          title: memberTitle,
          summary: `요약 ${run}`,
          publishedAt: new Date(now - 120_000).toISOString(),
        },
        {
          n: 2,
          title: rightsTitle,
          summary: `요약 ${run}`,
          publishedAt: new Date(now - 60_000).toISOString(),
        },
      ],
    });
    const created = await callApi<{ id: number }>(admin, "POST", "/admin/external-blogs", {
      feedUrl: stubUrl(feed),
      defaultTopicId: topic.id,
      registrationBasis: `E2E 스텁 피드 ${run}`,
    });
    expect(created.status).toBe(201);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("회원이 '삭제 요청'으로 신고하고 관리자가 '포털에서 내림'으로 처리하면 포털에서 사라진다", async ({
    browser,
  }) => {
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await signUp(page, reporter);
    const article = await card(page, topic.path, memberTitle);
    const form = article.getByRole("form", { name: "외부 글 신고" });
    await expect(async () => {
      if (!(await form.isVisible())) {
        await article.getByText("삭제 요청", { exact: true }).click();
      }
      await expect(form).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await form.getByLabel("저작권 침해").check();
    await form.getByRole("button", { name: "신고하기" }).click();
    await expect(
      page
        .locator('article[data-source="EXTERNAL"]')
        .filter({ hasText: memberTitle })
        .getByRole("status"),
    ).toHaveText("신고가 접수되었습니다.");
    await context.close();

    const adminContext = await newGuestContext(browser);
    const adminPage = await adminContext.newPage();
    adminPage.on("dialog", (dialog) => void dialog.accept());
    const { email, password } = adminAccount();
    await logInWith(adminPage, email, password);
    await adminPage.goto("/admin/reports?targetType=EXTERNAL_POST");
    const row = adminPage
      .getByRole("table", { name: "신고 목록" })
      .getByRole("row")
      .filter({ hasText: memberTitle });
    await row.getByRole("link", { name: /^신고 \d+건$/ }).click();
    await expect(adminPage.getByRole("heading", { level: 1, name: "신고 상세" })).toBeVisible();
    await expect(adminPage.getByRole("button", { name: "숨김", exact: true })).toHaveCount(0);
    await adminPage.getByRole("button", { name: "포털에서 내림" }).click();
    await expect(adminPage.getByRole("status")).toHaveText("신고 1건을 처리했습니다.");
    await expect(adminPage.getByRole("region", { name: "처리 결과" })).toContainText(
      "포털에서 내림",
    );
    await adminContext.close();

    const guest = await newGuestContext(browser);
    const portal = await guest.newPage();
    await portal.goto(`${topic.path}?source=external`);
    await expect(
      portal.locator('article[data-source="EXTERNAL"]').filter({ hasText: memberTitle }),
    ).toHaveCount(0);
    await guest.close();
  });

  test("비로그인 '삭제 요청'은 이동 주소가 채워진 권리 침해 신고로 가고, 대상이 그 외부 글로 잡힌다", async ({
    browser,
  }) => {
    const guest = await newGuestContext(browser);
    const page = await guest.newPage();
    const article = await card(page, topic.path, rightsTitle);
    await article.getByRole("link", { name: "삭제 요청" }).click();
    await expect(page).toHaveURL(/\/rights-request\?url=/);
    await expect(page.getByLabel("신고할 주소")).toHaveValue(
      /^https?:\/\/[^/]+\/api\/v1\/external-posts\/\d+\/visit$/,
    );
    await page.getByLabel("저작권 침해").check();
    await page.getByLabel("권리 근거").fill("제 블로그 글이 허락 없이 포털에 실렸습니다.");
    await page.getByLabel("연락받을 이메일").fill(`rights-${run}@example.test`);
    await page.getByRole("button", { name: "신고 접수" }).click();
    await expect(page).toHaveURL(/\/rights-request\?submitted=1$/);
    await guest.close();

    const groups = await callApi<ReportGroup[]>(
      admin,
      "GET",
      "/admin/reports?targetType=EXTERNAL_POST",
    );
    expect(groups.status).toBe(200);
    expect(
      groups.body.result.some(
        (group) => group.channel !== "MEMBER" && group.target?.title === rightsTitle,
      ),
      "권리 침해 신고의 대상이 외부 글",
    ).toBe(true);
  });
});
