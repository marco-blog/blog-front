import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

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
import { addItem, stubFeed, stubUrl, uniqueStubName, type StubBlog } from "./support/feedStub.js";

const MINUTE = 60 * 1000;

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

interface AdminPost {
  id: number;
  title: string;
  topicId: number;
  topicSource: string;
}

interface Stats {
  finalAccuracy: { sample: number };
  pendingReviews: number;
}

interface TopicTree {
  id: number;
  slug: string;
  children: { id: number; slug: string }[];
}

/** 주제 slug → id와 주제 페이지 주소(`/topics/{대분류}/{소분류}`) */
async function topicBySlug(request: APIRequestContext, slug: string) {
  const tree = await callApi<TopicTree[]>(request, "GET", "/topics");
  for (const major of tree.body.result) {
    const minor = major.children.find((child) => child.slug === slug);
    if (minor) {
      return { id: minor.id, path: `/topics/${major.slug}/${minor.slug}` };
    }
  }
  throw new Error(`주제 ${slug} 없음`);
}

/** 관리자 API로 그 등록의 수집된 글을 기다린다(조건을 만족할 때까지). */
async function waitForPost(
  admin: APIRequestContext,
  blogId: number,
  match: (post: AdminPost) => boolean,
): Promise<AdminPost> {
  let found: AdminPost | undefined;
  await expect
    .poll(
      async () => {
        const response = await callApi<AdminPost[]>(
          admin,
          "GET",
          `/admin/external-blogs/${blogId}/posts?size=50`,
        );
        found = response.status === 200 ? response.body.result.find(match) : undefined;
        return found !== undefined;
      },
      { timeout: 60_000, intervals: [2_000, 3_000, 5_000] },
    )
    .toBe(true);
  return found!;
}

async function stats(admin: APIRequestContext) {
  const response = await callApi<Stats>(admin, "GET", "/admin/classification-stats");
  expect(response.status).toBe(200);
  return response.body.result;
}

async function adminPage(browser: Browser): Promise<Page> {
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  const { email, password } = adminAccount();
  await logInWith(page, email, password);
  return page;
}

/**
 * 007 US3 분류 검수·주인 주제·매핑 규칙(quickstart #20~#26, T066). 피드는 E2E 스텁 서버(127.0.0.1:4610)가 준다.
 * 사전에 없는 말뿐인 글은 기본 주제(IT 인터넷)로 들어가고 "예측 없음" 검수 대기가 된다 → 운영자가 검수 화면에서 과학으로 확정 → 과학 주제
 * 페이지에 카드, 분류 현황의 최종 주제 표본이 1 늘어남. 소유 인증된 주인이 글 주제를 반려동물로 바꾸면 포털에 반영되고 출처는 "주인",
 * 원문 제목이 바뀌어 다시 수집돼도 주제는 그대로. 매핑 규칙은 추가한 뒤 수집되는 글에만 적용된다.
 */
test.describe("007 US3 분류 검수와 주제 고치기", () => {
  requireBackend();
  requireAdmin();
  requireExternalTestSettings();
  test.describe.configure({ mode: "serial" });

  const member = newAccount("xc");
  const run = member.handle.slice(-6);
  const keyword = `e2erule${run}`.toLowerCase();
  const feedC = uniqueStubName("xc");
  const feedO = uniqueStubName("xo");
  const reviewTitle = `잡담 메모 ${run}`;
  const beforeRuleTitle = `규칙 전 글 ${run}`;
  const blogC: StubBlog = {
    title: `C 블로그 ${run}`,
    items: [
      { n: 1, title: reviewTitle, summary: `zqx ${run}`, publishedAt: minutesAgo(20) },
      {
        n: 2,
        title: beforeRuleTitle,
        summary: `zqy ${run}`,
        categories: [keyword],
        publishedAt: minutesAgo(19),
      },
    ],
  };
  const blogO: StubBlog = { title: `O 블로그 ${run}`, items: [] };
  let admin: APIRequestContext;
  let it = { id: 0, path: "" };
  let science = { id: 0, path: "" };
  let pets = { id: 0, path: "" };
  let blogCId = 0;

  test.beforeAll(async ({ playwright }) => {
    admin = await adminRequest(playwright);
    it = await topicBySlug(admin, "it-internet");
    science = await topicBySlug(admin, "science");
    pets = await topicBySlug(admin, "pets");
    await stubFeed(feedC, blogC);
    const created = await callApi<{ id: number }>(admin, "POST", "/admin/external-blogs", {
      feedUrl: stubUrl(feedC),
      defaultTopicId: it.id,
      registrationBasis: `E2E 스텁 피드 ${run}`,
    });
    expect(created.status, "관리자 직접 등록").toBe(201);
    blogCId = created.body.result.id;
    await waitForPost(admin, blogCId, (post) => post.title === beforeRuleTitle);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("예측 없음 검수를 과학으로 확정하면 포털에 반영되고 분류 현황 표본이 는다", async ({
    browser,
  }) => {
    const pending = await waitForPost(admin, blogCId, (post) => post.title === reviewTitle);
    expect(pending.topicId).toBe(it.id);
    expect(pending.topicSource).toBe("DEFAULT");
    const before = await stats(admin);

    const page = await adminPage(browser);
    await page.goto("/admin/external-blogs");
    await page
      .getByRole("navigation", { name: "외부 블로그 관리 메뉴" })
      .getByRole("link", { name: "분류 검수" })
      .click();
    await expect(page).toHaveURL(/\/admin\/external-blogs\/reviews$/);
    await page.goto(`/admin/external-blogs/reviews?blogId=${blogCId}`);
    const row = page
      .getByRole("table", { name: "분류 검수" })
      .getByRole("row")
      .filter({ hasText: reviewTitle });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(3)).toHaveText(/없음/);
    const select = row.getByLabel(`${reviewTitle} 확정 주제`);
    await expect(select).toHaveValue(String(it.id));
    await select.selectOption(String(science.id));
    await row.getByRole("button", { name: "확정" }).click();
    await expect(page.getByText("확정했습니다.")).toBeVisible();
    await expect(
      page
        .getByRole("table", { name: "분류 검수" })
        .getByRole("row")
        .filter({ hasText: reviewTitle }),
    ).toHaveCount(0);

    const confirmed = await waitForPost(admin, blogCId, (post) => post.title === reviewTitle);
    expect(confirmed.topicId).toBe(science.id);
    expect(confirmed.topicSource).toBe("REVIEW");
    const after = await stats(admin);
    expect(after.finalAccuracy.sample).toBe(before.finalAccuracy.sample + 1);
    expect(after.pendingReviews).toBe(before.pendingReviews - 1);

    await page.goto("/admin/external-blogs/stats");
    await expect(page.getByRole("heading", { name: "분류 현황", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "최종 주제 정확도" })).toContainText(
      `표본 ${after.finalAccuracy.sample.toLocaleString("ko-KR")}건`,
    );
    await page.context().close();

    const guest = await newGuestContext(browser);
    const portal = await guest.newPage();
    await portal.goto(`${science.path}?source=external`);
    await expect(
      portal.locator('article[data-source="EXTERNAL"]').filter({ hasText: reviewTitle }),
    ).toHaveCount(1);
    await guest.close();
  });

  test("인증된 주인이 글 주제를 바꾸면 포털에 반영되고, 원문이 바뀌어 다시 수집돼도 유지된다", async ({
    browser,
  }) => {
    const ownerTitle = `주인 글 ${run}`;
    const editedTitle = `주인 글 고침 ${run}`;
    await stubFeed(feedO, blogO);
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await signUp(page, member);
    const api = page.request;
    const issued = await callApi<{ id: number; code: string }>(
      api,
      "POST",
      "/me/external-blog-verifications",
      { feedUrl: stubUrl(feedO) },
    );
    expect(issued.status).toBe(201);
    const item = { n: 1, title: ownerTitle, summary: `zqz ${run}`, publishedAt: minutesAgo(5) };
    await stubFeed(feedO, { ...blogO, verifyCode: issued.body.result.code, items: [item] });
    const checked = await callApi<{ verifiedAt: string | null }>(
      api,
      "POST",
      `/me/external-blog-verifications/${issued.body.result.id}/check`,
      { feedUrl: stubUrl(feedO) },
    );
    expect(checked.body.result.verifiedAt).toBeTruthy();
    const requested = await callApi<{ id: number }>(api, "POST", "/me/external-blogs", {
      feedUrl: stubUrl(feedO),
      defaultTopicId: it.id,
      verificationId: issued.body.result.id,
    });
    expect(requested.status).toBe(201);
    const blogOId = requested.body.result.id;
    expect(
      (await callApi(admin, "POST", `/admin/external-blogs/${blogOId}/approve`, {})).status,
    ).toBe(200);
    await waitForPost(admin, blogOId, (post) => post.title === ownerTitle);

    await page.goto(`/${member.handle}/manage/external-blogs/${blogOId}`);
    const table = page.getByRole("table", { name: "수집된 글" });
    const row = table.getByRole("row").filter({ hasText: ownerTitle });
    await row.getByLabel(`${ownerTitle} 주제`).selectOption(String(pets.id));
    await row.getByRole("button", { name: "바꾸기" }).click();
    await expect(page.getByText("저장했습니다.")).toBeVisible();
    await expect(
      table.getByRole("row").filter({ hasText: ownerTitle }).locator(".topic-source"),
    ).toHaveText("주인");

    const guest = await newGuestContext(browser);
    const portal = await guest.newPage();
    await portal.goto(`${pets.path}?source=external`);
    await expect(
      portal.locator('article[data-source="EXTERNAL"]').filter({ hasText: ownerTitle }),
    ).toHaveCount(1);

    // 원문 제목이 바뀌어 다시 수집돼도 사람이 정한 주제·출처는 그대로
    await stubFeed(feedO, { ...blogO, items: [{ ...item, title: editedTitle }] });
    const edited = await waitForPost(admin, blogOId, (post) => post.title === editedTitle);
    expect(edited.topicId).toBe(pets.id);
    expect(edited.topicSource).toBe("OWNER");
    await portal.goto(`${pets.path}?source=external`);
    await expect(
      portal.locator('article[data-source="EXTERNAL"]').filter({ hasText: editedTitle }),
    ).toHaveCount(1);
    await guest.close();
    await context.close();
  });

  test("매핑 규칙은 추가한 뒤 수집되는 글에만 적용된다", async ({ browser }) => {
    const afterRuleTitle = `규칙 후 글 ${run}`;
    const page = await adminPage(browser);
    await page.goto("/admin/external-blogs/rules");
    await expect(page.getByText("규칙은 이후 수집되는 글에만 적용됩니다.")).toBeVisible();
    const form = page.getByRole("form", { name: "규칙 추가" });
    await form.getByLabel("키워드").fill(keyword);
    await form.getByLabel("주제").selectOption(String(science.id));
    await form.getByLabel("우선순위").fill("10");
    await form.getByRole("button", { name: "규칙 추가" }).click();
    await expect(page.getByText("규칙을 추가했습니다.")).toBeVisible();
    await expect(page.getByRole("table", { name: "매핑 규칙" })).toContainText(keyword);

    await addItem(feedC, {
      n: 3,
      title: afterRuleTitle,
      summary: `zqw ${run}`,
      categories: [keyword],
      publishedAt: minutesAgo(1),
    });
    const ruled = await waitForPost(admin, blogCId, (post) => post.title === afterRuleTitle);
    expect(ruled.topicId).toBe(science.id);
    expect(ruled.topicSource).toBe("RULE");
    const earlier = await waitForPost(admin, blogCId, (post) => post.title === beforeRuleTitle);
    expect(earlier.topicId).toBe(it.id);
    expect(earlier.topicSource).toBe("DEFAULT");

    // 다음 실행과 겹치지 않게 규칙을 지운다
    const ruleRow = page.getByRole("table", { name: "매핑 규칙" }).getByRole("row").filter({
      hasText: keyword,
    });
    await ruleRow.getByRole("button", { name: `삭제 ${keyword}` }).click();
    await expect(page.getByText("규칙을 삭제했습니다.")).toBeVisible();
    await page.context().close();
  });
});
