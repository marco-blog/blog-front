import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";

import {
  adminAccount,
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
import { stubFeed, stubUrl, uniqueStubName, type StubBlog } from "./support/feedStub.js";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
  return new Date(Date.now() - days * DAY).toISOString();
}

/** `GET /topics` 첫 소분류 id(어떤 주제든 상관없는 신청용) */
async function anyTopicId(request: APIRequestContext) {
  const tree = await callApi<{ id: number; children: { id: number }[] }[]>(
    request,
    "GET",
    "/topics",
  );
  expect(tree.status).toBe(200);
  const minor = tree.body.result.flatMap((major) => major.children)[0];
  expect(minor, "소분류 주제").toBeTruthy();
  return minor!.id;
}

async function adminPage(browser: Browser): Promise<Page> {
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  const { email, password } = adminAccount();
  await logInWith(page, email, password);
  return page;
}

async function memberPage(browser: Browser, account: Account): Promise<Page> {
  const context = await newGuestContext(browser);
  const page = await context.newPage();
  await signUp(page, account);
  return page;
}

/** 상세 화면을 다시 열어 가며 상태 배지와 수집된 글 수가 기대값이 될 때까지 기다린다(2초마다 고르고 5초마다 수집). */
async function waitForCollected(page: Page, path: string, titles: string[]) {
  await expect(async () => {
    await page.goto(path);
    await expect(page.locator(".external-status").first()).toHaveText("수집 중");
    const table = page.getByRole("table", { name: "수집된 글" });
    await expect(table.locator("tbody tr")).toHaveCount(titles.length, { timeout: 1_000 });
    for (const title of titles) {
      await expect(table.getByRole("link", { name: title })).toBeVisible({ timeout: 1_000 });
    }
  }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
}

/**
 * 007 US1 외부 블로그 등록(quickstart #1~#11, T032). 피드는 E2E 스텁 서버(127.0.0.1:4610)가 준다.
 * 회원 A: 미리보기(최근 3편) → 코드 발급 → 코드 없이 확인 실패 → 스텁에 코드를 넣고 확인 → 기본 주제 → 신청 → 관리자 목록 "승인 대기"에
 * 소유 인증 표시 → 승인 → 수집 중·수집된 글 1편(40일 넘은 글 제외) → 승인 알림. 관리자 직접 등록은 바로 수집 중. 회원 B가 같은 피드를
 * 신청하면 409, 소유 인증 뒤 넘겨받기. 우리 서비스 주소는 422, 회원당 3개 한도.
 */
test.describe("007 US1 외부 블로그 등록", () => {
  requireBackend();
  requireAdmin();
  requireExternalTestSettings();
  test.describe.configure({ mode: "serial" });

  const memberA = newAccount("xa");
  const memberB = newAccount("xb");
  const run = memberA.handle.slice(-6);
  const feedA = uniqueStubName("xa");
  const feedD = uniqueStubName("xd");
  const recentTitle = `최근 글 ${run}`;
  const oldTitles = [40, 41, 42].map((days) => `${days}일 전 글 ${run}`);
  const blogA: StubBlog = {
    title: `A 블로그 ${run}`,
    items: [
      // 피드 순서(새 글 먼저). 미리보기는 앞의 3편
      { n: 4, title: recentTitle, publishedAt: daysAgo(0.1) },
      { n: 3, title: oldTitles[0]!, publishedAt: daysAgo(40) },
      { n: 2, title: oldTitles[1]!, publishedAt: daysAgo(41) },
      { n: 1, title: oldTitles[2]!, publishedAt: daysAgo(42) },
    ],
  };
  const directTitle = `직접 등록 글 ${run}`;
  const blogD: StubBlog = {
    title: `D 블로그 ${run}`,
    items: [{ n: 1, title: directTitle, publishedAt: daysAgo(1) }],
  };
  let pageA: Page;
  let admin: Page;
  let directId = 0;

  test.beforeAll(async ({ browser }) => {
    await stubFeed(feedA, blogA);
    await stubFeed(feedD, blogD);
    pageA = await memberPage(browser, memberA);
    admin = await adminPage(browser);
  });

  test.afterAll(async () => {
    await pageA?.context().close();
    await admin?.context().close();
  });

  test("회원 신청: 미리보기 → 소유 인증 → 신청 → 승인 → 수집", async () => {
    const page = pageA;
    await page.goto(`/${memberA.handle}/manage/external-blogs`);
    await expect(page.getByText("등록한 외부 블로그가 없습니다.")).toBeVisible();
    await page.getByRole("link", { name: "외부 블로그 등록 신청" }).click();
    await expect(page).toHaveURL(new RegExp(`/${memberA.handle}/manage/external-blogs/new`));

    // 블로그 첫 화면 주소에서 <link rel="alternate">로 피드를 찾는다. 최근 글 3편
    await page.getByLabel("블로그 주소 또는 피드 주소").fill(stubUrl(feedA, "site"));
    await page.getByRole("button", { name: "미리보기" }).click();
    const preview = page.getByRole("region", { name: "찾은 블로그" });
    await expect(preview.getByText(blogA.title!)).toBeVisible();
    await expect(preview.getByText(stubUrl(feedA))).toBeVisible();
    await expect(preview.getByRole("listitem")).toHaveCount(3);
    await expect(preview.getByRole("link", { name: recentTitle })).toBeVisible();
    await expect(preview.getByRole("link", { name: oldTitles[2]! })).toHaveCount(0);

    // 코드 발급 → 코드 없이 확인하면 실패
    await page.getByRole("button", { name: "인증 코드 받기" }).click();
    const code = (await page.locator(".verification-code").textContent())?.trim() ?? "";
    expect(code).toMatch(/^java21-verify-[0-9A-Za-z]{12}$/);
    await page.getByRole("button", { name: "인증 확인" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "피드와 블로그 첫 화면 어디에서도 인증 코드를 찾지 못했습니다.",
    );

    // 스텁 블로그 소개란에 코드를 넣고 다시 확인
    await stubFeed(feedA, { ...blogA, verifyCode: code });
    await page.getByRole("button", { name: "인증 확인" }).click();
    await expect(page.getByText("소유 인증을 마쳤습니다.")).toBeVisible();
    await page.getByRole("link", { name: "다음" }).click();

    await page.getByLabel("기본 주제").selectOption({ index: 1 });
    await page.getByRole("button", { name: "신청" }).click();
    await expect(page).toHaveURL(new RegExp(`/${memberA.handle}/manage/external-blogs/\\d+$`));
    const detailPath = new URL(page.url()).pathname;
    await expect(page.locator(".external-status")).toHaveText("승인 대기");
    await expect(page.getByText("운영자 승인을 기다리고 있습니다.")).toBeVisible();

    // 관리자 목록 "승인 대기"에 소유 인증 표시 → 승인
    await admin.goto("/admin/external-blogs?status=PENDING");
    const row = admin.getByRole("row").filter({ hasText: blogA.title! });
    await expect(row).toBeVisible();
    await expect(row).toContainText("소유 인증됨");
    await expect(row).toContainText("회원 신청");
    await expect(row).toContainText(memberA.nickname);
    await row.getByRole("link", { name: blogA.title! }).click();
    await admin.getByRole("button", { name: "승인" }).click();
    await expect(admin.getByText("처리했습니다.")).toBeVisible();
    await expect(admin.locator(".external-status")).toHaveText("수집 중");

    // 수집: 최초 수집은 30일 안 글만(40일 넘은 3편 제외)
    await waitForCollected(page, detailPath, [recentTitle]);
    for (const old of oldTitles) {
      await expect(page.getByRole("link", { name: old })).toHaveCount(0);
    }

    // 승인 알림
    await page.goto("/notifications");
    await expect(
      page.getByText(`외부 블로그 ${blogA.title!} 등록이 승인되었습니다. 곧 글을 수집합니다.`),
    ).toBeVisible();
  });

  test("관리자 직접 등록은 등록 근거와 함께 바로 수집 중", async () => {
    await admin.goto("/admin/external-blogs");
    await admin.getByRole("link", { name: "직접 등록", exact: true }).click();
    await expect(admin).toHaveURL(/\/admin\/external-blogs\/new$/);
    await admin.getByLabel("블로그 주소 또는 피드 주소").fill(stubUrl(feedD));
    await admin.getByRole("button", { name: "미리보기" }).click();
    await expect(
      admin.getByRole("region", { name: "찾은 블로그" }).getByText(blogD.title!),
    ).toBeVisible();

    // 등록 근거 없이 등록하면 필드 오류
    await admin.getByLabel("기본 주제").selectOption({ index: 1 });
    await admin.getByRole("button", { name: "등록", exact: true }).click();
    await expect(admin.getByRole("alert").first()).toBeVisible();
    await expect(admin).toHaveURL(/\/admin\/external-blogs\/new$/);

    await admin.getByLabel("기본 주제").selectOption({ index: 1 });
    await admin.getByLabel("등록 근거").fill(`E2E 스텁 피드 공개 배포 ${run}`);
    await admin.getByRole("button", { name: "등록", exact: true }).click();
    await expect(admin).toHaveURL(/\/admin\/external-blogs\/\d+$/);
    directId = Number(new URL(admin.url()).pathname.split("/").pop());
    await expect(admin.locator(".external-status")).toHaveText("수집 중");
    await expect(admin.getByText("운영자 직접 등록")).toBeVisible();
    await expect(admin.getByText(`E2E 스텁 피드 공개 배포 ${run}`)).toBeVisible();

    await expect(async () => {
      await admin.goto(`/admin/external-blogs/${directId}`);
      await expect(
        admin.getByRole("table", { name: "수집된 글" }).getByRole("link", { name: directTitle }),
      ).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 60_000, intervals: [2_000, 3_000, 5_000] });
  });

  test("회원 B: 이미 등록된 피드는 409, 소유 인증 뒤 넘겨받기", async ({ browser }) => {
    const page = await memberPage(browser, memberB);
    try {
      const topicId = await anyTopicId(page.request);
      const conflict = await callApi<unknown>(page.request, "POST", "/me/external-blogs", {
        feedUrl: stubUrl(feedD),
        defaultTopicId: topicId,
      });
      expect(conflict.status).toBe(409);
      expect(conflict.body.header.resultCode).toBe("EXTERNAL_BLOG_ALREADY_REGISTERED");

      await page.goto(`/${memberB.handle}/manage/external-blogs/new`);
      await page.getByLabel("블로그 주소 또는 피드 주소").fill(stubUrl(feedD));
      await page.getByRole("button", { name: "미리보기" }).click();
      await expect(
        page.getByText(
          "이미 등록된 블로그입니다. 내 블로그라면 소유 인증 후 넘겨받을 수 있습니다.",
        ),
      ).toBeVisible();
      await page.getByRole("button", { name: "인증 코드 받기" }).click();
      const code = (await page.locator(".verification-code").textContent())?.trim() ?? "";
      expect(code.length).toBeGreaterThan(0);
      await stubFeed(feedD, { ...blogD, verifyCode: code });
      await page.getByRole("button", { name: "인증 확인" }).click();
      await expect(page.getByText("소유 인증을 마쳤습니다.")).toBeVisible();
      await page.getByRole("button", { name: "넘겨받기" }).click();

      await expect(page).toHaveURL(
        new RegExp(`/${memberB.handle}/manage/external-blogs/${directId}$`),
      );
      await expect(page.locator(".external-status")).toHaveText("수집 중");
      await expect(page.locator(".external-blog-info")).toContainText("소유 인증됨");

      await admin.goto(`/admin/external-blogs/${directId}`);
      await expect(admin.locator(".external-blog-info").first()).toContainText(memberB.nickname);
    } finally {
      await page.context().close();
    }
  });

  test("우리 서비스 주소는 등록할 수 없다(422)", async () => {
    const page = pageA;
    // E2E front 주소(backend blog.base-url과 같다, 기본 http://localhost:5173)
    const origin = new URL(test.info().project.use.baseURL ?? "http://localhost:5173").origin;
    const self = await callApi<unknown>(page.request, "POST", "/external-blog-previews", {
      url: `${origin}/${memberA.handle}/rss`,
    });
    expect(self.status).toBe(422);
    expect(self.body.header.resultCode).toBe("EXTERNAL_FEED_URL_NOT_ALLOWED");

    await page.goto(`/${memberA.handle}/manage/external-blogs/new`);
    await page.getByLabel("블로그 주소 또는 피드 주소").fill(`${origin}/${memberA.handle}`);
    await page.getByRole("button", { name: "미리보기" }).click();
    await expect(page.getByRole("alert")).toContainText("우리 서비스 블로그는 등록할 수 없습니다.");
  });

  test("회원당 3개 한도", async () => {
    const page = pageA;
    const topicId = await anyTopicId(page.request);
    const extra = [uniqueStubName("xl"), uniqueStubName("xl"), uniqueStubName("xl")];
    for (const name of extra) {
      await stubFeed(name, { title: `한도 ${name}`, items: [{ title: `글 ${name}` }] });
    }
    for (const name of extra.slice(0, 2)) {
      const created = await callApi<unknown>(page.request, "POST", "/me/external-blogs", {
        feedUrl: stubUrl(name),
        defaultTopicId: topicId,
      });
      expect(created.status, `신청 ${name}`).toBe(201);
    }
    const over = await callApi<unknown>(page.request, "POST", "/me/external-blogs", {
      feedUrl: stubUrl(extra[2]!),
      defaultTopicId: topicId,
    });
    expect(over.status).toBe(409);
    expect(over.body.header.resultCode).toBe("EXTERNAL_BLOG_LIMIT_EXCEEDED");

    await page.goto(`/${memberA.handle}/manage/external-blogs`);
    await expect(
      page.getByRole("table", { name: "내 외부 블로그" }).locator("tbody tr"),
    ).toHaveCount(3);
    await expect(page.getByRole("button", { name: "외부 블로그 등록 신청" })).toBeDisabled();
    await expect(page.getByText("외부 블로그는 3개까지 등록할 수 있습니다.")).toBeVisible();
  });
});
