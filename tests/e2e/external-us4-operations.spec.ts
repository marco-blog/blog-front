import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import {
  PASSWORD,
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
  type Account,
} from "./support/backend.js";
import {
  addItem,
  setStatus,
  stubFeed,
  stubUrl,
  uniqueStubName,
  type StubBlog,
  type StubItem,
} from "./support/feedStub.js";

const MINUTE = 60 * 1000;
/** 수집 주기(E2E `FETCH_INTERVAL=PT5S`)의 두 배 넘게 기다려도 새 글이 없으면 "수집하지 않음"으로 본다 */
const NOT_FETCHED_WAIT = 15_000;

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * MINUTE).toISOString();
}

interface AdminPost {
  id: number;
  title: string;
  status: string;
}

interface TopicTree {
  id: number;
  slug: string;
  children: { id: number; slug: string }[];
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

async function adminPosts(admin: APIRequestContext, blogId: number) {
  const response = await callApi<AdminPost[]>(
    admin,
    "GET",
    `/admin/external-blogs/${blogId}/posts?size=50`,
  );
  return response.status === 200 ? response.body.result : [];
}

async function waitForPost(admin: APIRequestContext, blogId: number, title: string) {
  await expect
    .poll(async () => (await adminPosts(admin, blogId)).some((post) => post.title === title), {
      timeout: 60_000,
      intervals: [2_000, 3_000, 5_000],
    })
    .toBe(true);
}

async function adminPage(browser: Browser): Promise<Page> {
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  const { email, password } = adminAccount();
  await logInWith(page, email, password);
  return page;
}

/** 회원 페이지(가입·로그인된 브라우저). 확인 창은 모두 수락 */
async function memberPage(browser: Browser, account: Account): Promise<Page> {
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  page.on("dialog", (dialog) => void dialog.accept());
  await signUp(page, account);
  return page;
}

/** 회원이 피드를 신청하고 관리자가 승인한다. 등록 id */
async function requestAndApprove(
  member: APIRequestContext,
  admin: APIRequestContext,
  feed: string,
  topicId: number,
): Promise<number> {
  const created = await callApi<{ id: number }>(member, "POST", "/me/external-blogs", {
    feedUrl: stubUrl(feed),
    defaultTopicId: topicId,
  });
  expect(created.status, "회원 신청").toBe(201);
  const id = created.body.result.id;
  expect((await callApi(admin, "POST", `/admin/external-blogs/${id}/approve`, {})).status).toBe(
    200,
  );
  return id;
}

/**
 * 007 US4 해제와 운영(quickstart #28~#31·#33·#34, T078). 피드는 E2E 스텁 서버(127.0.0.1:4610)가 준다. 포털 캐시는 0초.
 * 해제(삭제·남기기, 결정 표 24번), 남긴 글을 같은 피드의 새 등록이 넘겨받음, 관리자 일시 중지·재개·차단, 포털 제외·해제, 피드 오류 시
 * 연속 실패 수, 회원 탈퇴 시 글 내림.
 */
test.describe("007 US4 해제와 운영", () => {
  requireBackend();
  requireAdmin();
  requireExternalTestSettings();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("xr");
  const run = owner.handle.slice(-6);
  let admin: APIRequestContext;
  let topic = { id: 0, path: "" };

  /** 손님 브라우저로 IT 주제의 외부 글 중 그 제목 카드 수 */
  async function portalCount(browser: Browser, title: string) {
    const guest = await newGuestContext(browser);
    const page = await guest.newPage();
    await page.goto(`${topic.path}?source=external`);
    const count = await page
      .locator('article[data-source="EXTERNAL"]')
      .filter({ hasText: title })
      .count();
    await guest.close();
    return count;
  }

  async function expectOnPortal(browser: Browser, title: string, count: number) {
    await expect
      .poll(() => portalCount(browser, title), { timeout: 30_000, intervals: [1_000, 2_000] })
      .toBe(count);
  }

  function item(n: number, title: string, minutes = 10 - n): StubItem {
    return { n, title, summary: `요약 ${run} ${n}`, publishedAt: minutesAgo(minutes) };
  }

  test.beforeAll(async ({ playwright }) => {
    admin = await adminRequest(playwright);
    topic = await itTopic(admin);
  });

  test.afterAll(async () => {
    await admin?.dispose();
  });

  test("삭제로 해제하면 포털에서 바로 사라지고 같은 피드를 다시 신청할 수 있다", async ({
    browser,
  }) => {
    const feed = uniqueStubName("xd");
    const title = `삭제 해제 ${run}`;
    await stubFeed(feed, { title: `D ${run}`, items: [item(1, title)] });
    const page = await memberPage(browser, owner);
    const id = await requestAndApprove(page.request, admin, feed, topic.id);
    await waitForPost(admin, id, title);
    await expectOnPortal(browser, title, 1);

    await page.goto(`/${owner.handle}/manage/external-blogs/${id}`);
    await page.getByRole("button", { name: "해제" }).click();
    await expect(page.getByText("남길지 삭제할지 골라 주세요.")).toBeVisible();
    await page.getByRole("radio", { name: /수집된 글 삭제/ }).check();
    await page.getByRole("button", { name: "해제" }).click();
    await expect(page.getByText("등록을 해제했습니다.")).toBeVisible();
    await expect(page.getByText("해제된 등록입니다.")).toBeVisible();
    await expectOnPortal(browser, title, 0);

    const again = await callApi<{ id: number }>(page.request, "POST", "/me/external-blogs", {
      feedUrl: stubUrl(feed),
      defaultTopicId: topic.id,
    });
    expect(again.status, "해제 뒤 같은 피드 재신청").toBe(201);
    expect(
      (
        await callApi(page.request, "POST", `/me/external-blogs/${again.body.result.id}/release`, {
          deletePosts: true,
        })
      ).status,
    ).toBe(200);
    await page.context().close();
  });

  test("남기기로 해제하면 글은 남고 새 글은 가져오지 않으며, 남긴 글 삭제로 사라진다", async ({
    browser,
  }) => {
    const feed = uniqueStubName("xk");
    const title = `남긴 글 ${run}`;
    const later = `해제 뒤 글 ${run}`;
    const blog: StubBlog = { title: `K ${run}`, items: [item(1, title)] };
    await stubFeed(feed, blog);
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    page.on("dialog", (dialog) => void dialog.accept());
    await logInWith(page, owner.email, PASSWORD);
    const id = await requestAndApprove(page.request, admin, feed, topic.id);
    await waitForPost(admin, id, title);

    await page.goto(`/${owner.handle}/manage/external-blogs/${id}`);
    await page.getByRole("radio", { name: /수집된 글 남기기/ }).check();
    await page.getByRole("button", { name: "해제" }).click();
    await expect(page.getByText("해제됨 · 남긴 글 1편이 포털에 보이는 중")).toBeVisible();
    await expectOnPortal(browser, title, 1);

    await addItem(feed, item(2, later, 1));
    await page.waitForTimeout(NOT_FETCHED_WAIT);
    expect((await adminPosts(admin, id)).map((post) => post.title)).not.toContain(later);
    expect(await portalCount(browser, later)).toBe(0);

    await page.getByRole("button", { name: "남긴 글 삭제" }).click();
    await expect(page.getByText("해제된 등록입니다.")).toBeVisible();
    await expectOnPortal(browser, title, 0);
    await context.close();
  });

  test("남긴 글이 있는 피드를 다른 회원이 신청·승인하면 글이 새 등록으로 옮겨 가 포털에 한 번만 보인다", async ({
    browser,
  }) => {
    const feed = uniqueStubName("xm");
    const title = `옮겨 간 글 ${run}`;
    await stubFeed(feed, { title: `M ${run}`, items: [item(1, title)] });
    const context = await newGuestContext(browser);
    const page = await context.newPage();
    await logInWith(page, owner.email, PASSWORD);
    const first = await requestAndApprove(page.request, admin, feed, topic.id);
    await waitForPost(admin, first, title);
    expect(
      (
        await callApi(page.request, "POST", `/me/external-blogs/${first}/release`, {
          deletePosts: false,
        })
      ).status,
    ).toBe(200);
    await context.close();

    const other = newAccount("xn");
    const otherPage = await memberPage(browser, other);
    const second = await requestAndApprove(otherPage.request, admin, feed, topic.id);
    await waitForPost(admin, second, title);
    expect(await adminPosts(admin, first)).toHaveLength(0);
    await expectOnPortal(browser, title, 1);
    await otherPage.context().close();
  });

  test("관리자 일시 중지·재개·차단: 중지 중엔 새 글이 없고, 재개하면 수집, 차단하면 모두 사라지고 넘겨받을 수 없다", async ({
    browser,
  }) => {
    const feed = uniqueStubName("xp");
    const first = `운영 글 1 ${run}`;
    const second = `운영 글 2 ${run}`;
    await stubFeed(feed, { title: `P ${run}`, items: [item(1, first)] });
    const created = await callApi<{ id: number }>(admin, "POST", "/admin/external-blogs", {
      feedUrl: stubUrl(feed),
      defaultTopicId: topic.id,
      registrationBasis: `E2E 스텁 피드 ${run}`,
    });
    expect(created.status).toBe(201);
    const id = created.body.result.id;
    await waitForPost(admin, id, first);

    const page = await adminPage(browser);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/admin/external-blogs/${id}`);
    await page.getByRole("button", { name: "일시 중지" }).click();
    await expect(page.getByRole("button", { name: "재개" })).toBeVisible();
    await addItem(feed, item(2, second, 1));
    await page.waitForTimeout(NOT_FETCHED_WAIT);
    expect((await adminPosts(admin, id)).map((post) => post.title)).not.toContain(second);
    await expectOnPortal(browser, first, 1);

    await page.getByRole("button", { name: "재개" }).click();
    await expect(page.getByRole("button", { name: "일시 중지" })).toBeVisible();
    await waitForPost(admin, id, second);
    await expectOnPortal(browser, second, 1);

    await page.getByLabel("차단 사유").fill("E2E 차단");
    await page.getByRole("button", { name: "차단" }).click();
    await expect(page.getByText("처리했습니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "차단" })).toHaveCount(0);
    await expectOnPortal(browser, first, 0);
    await expectOnPortal(browser, second, 0);
    await page.context().close();

    const other = newAccount("xb");
    const otherPage = await memberPage(browser, other);
    const again = await callApi<{ claimable: boolean }>(
      otherPage.request,
      "POST",
      "/me/external-blogs",
      { feedUrl: stubUrl(feed), defaultTopicId: topic.id },
    );
    expect(again.status).toBe(409);
    expect(again.body.header.resultCode).toBe("EXTERNAL_BLOG_ALREADY_REGISTERED");
    expect((again.body.header as unknown as { params: { claimable: boolean } }).params).toEqual(
      expect.objectContaining({ claimable: false }),
    );
    await otherPage.context().close();
  });

  test("포털 제외하면 사라지고 해제하면 다시 보인다, 피드가 500이면 연속 실패 수가 는다", async ({
    browser,
  }) => {
    const feed = uniqueStubName("xe");
    const title = `제외 글 ${run}`;
    const blog: StubBlog = { title: `E ${run}`, items: [item(1, title)] };
    await stubFeed(feed, blog);
    const created = await callApi<{ id: number }>(admin, "POST", "/admin/external-blogs", {
      feedUrl: stubUrl(feed),
      defaultTopicId: topic.id,
      registrationBasis: `E2E 스텁 피드 ${run}`,
    });
    const id = created.body.result.id;
    await waitForPost(admin, id, title);
    await expectOnPortal(browser, title, 1);

    const page = await adminPage(browser);
    await page.goto(`/admin/external-blogs/${id}`);
    const row = page.getByRole("table", { name: "수집된 글" }).getByRole("row").filter({
      hasText: title,
    });
    await row.getByLabel(`${title} 포털 제외 사유`).fill("E2E 제외");
    await row.getByRole("button", { name: "포털 제외" }).click();
    await expect(page.getByText("제외됨: E2E 제외")).toBeVisible();
    await expectOnPortal(browser, title, 0);
    await page
      .getByRole("table", { name: "수집된 글" })
      .getByRole("row")
      .filter({ hasText: title })
      .getByRole("button", { name: "제외 해제" })
      .click();
    await expect(page.getByText("제외됨: E2E 제외")).toHaveCount(0);
    await expectOnPortal(browser, title, 1);
    await page.context().close();

    await setStatus(feed, 500, blog);
    await expect
      .poll(
        async () => {
          const detail = await callApi<{ consecutiveFailures: number }>(
            admin,
            "GET",
            `/admin/external-blogs/${id}`,
          );
          return detail.body.result.consecutiveFailures;
        },
        { timeout: 60_000, intervals: [2_000, 3_000, 5_000] },
      )
      .toBeGreaterThan(0);
    await setStatus(feed, null, blog);
  });

  test("외부 블로그를 가진 회원이 탈퇴하면 남기고 해제한 글까지 포털에서 사라진다", async ({
    browser,
  }) => {
    const member = newAccount("xw");
    const feedA = uniqueStubName("xwa");
    const feedB = uniqueStubName("xwb");
    const titleA = `탈퇴 글 A ${run}`;
    const titleB = `탈퇴 글 B ${run}`;
    await stubFeed(feedA, { title: `WA ${run}`, items: [item(1, titleA)] });
    await stubFeed(feedB, { title: `WB ${run}`, items: [item(1, titleB)] });
    const page = await memberPage(browser, member);
    const a = await requestAndApprove(page.request, admin, feedA, topic.id);
    const b = await requestAndApprove(page.request, admin, feedB, topic.id);
    await waitForPost(admin, a, titleA);
    await waitForPost(admin, b, titleB);
    expect(
      (
        await callApi(page.request, "POST", `/me/external-blogs/${b}/release`, {
          deletePosts: false,
        })
      ).status,
    ).toBe(200);
    await expectOnPortal(browser, titleA, 1);
    await expectOnPortal(browser, titleB, 1);

    const withdrawn = await callApi(page.request, "DELETE", "/me", { password: PASSWORD });
    expect(withdrawn.status, "탈퇴").toBe(200);
    await expectOnPortal(browser, titleA, 0);
    await expectOnPortal(browser, titleB, 0);
    await page.context().close();
  });
});
