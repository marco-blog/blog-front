import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  callApi,
  logIn,
  logInWith,
  logOut,
  newAccount,
  newGuestContext,
  publishPost,
  requireAdmin,
  requireAdminTestSettings,
  requireBackend,
  signUp,
  uniqueText,
} from "./support/backend.js";

/**
 * 006 US2 관리 콘솔(quickstart #10~#17, #19, T029): 관리자 상단 "시스템 관리" → `/admin` 대시보드, 가입·발행·댓글 뒤 오늘 수치가
 * 늘어남(다른 시나리오와 같은 DB이므로 "늘었다"로 단정), 주제 소분류 추가 → 글쓰기 발행 설정에 보임 → 숨김으로 정리,
 * 일반 회원·비로그인의 콘솔 404, 콘텐츠 관리 검색, 예약어·서비스 설정 화면.
 */
test.describe("006 US2 관리 콘솔", () => {
  requireBackend();
  requireAdmin();
  requireAdminTestSettings();
  test.describe.configure({ mode: "serial" });

  const writer = newAccount("ac");
  const run = writer.handle.slice(-6);
  const title = `콘솔${run} 검색 글`;
  const topicName = `콘솔주제${run}`;
  const topicSlug = `e2e-console-${run}`;

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logInWith(page, email, password);
  }

  async function today(page: Page, label: string) {
    const text = await page
      .getByRole("region", { name: "오늘" })
      .getByRole("listitem")
      .filter({ hasText: label })
      .locator("strong")
      .innerText();
    return Number(text.replace(/\D/g, ""));
  }

  test("상단 시스템 관리 → 대시보드, 가입·발행·댓글 뒤 오늘 수치가 늘어남(AS1·AS3, #10·#11)", async ({
    browser,
    page,
  }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "시스템 관리" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    const before = {
      signups: await today(page, "가입"),
      posts: await today(page, "발행 글"),
      comments: await today(page, "댓글"),
    };

    const context = await newGuestContext(browser);
    const member = await context.newPage();
    await signUp(member, writer);
    const postId = await publishPost(member.request, writer.handle, {
      title,
      contentMarkdown: `${title} 본문`,
    });
    const comment = await callApi(member.request, "POST", `/posts/${postId}/comments`, {
      content: uniqueText("콘솔 댓글"),
    });
    expect(comment.status).toBe(201);
    await context.close();

    await page.reload();
    expect(await today(page, "가입")).toBeGreaterThan(before.signups);
    expect(await today(page, "발행 글")).toBeGreaterThan(before.posts);
    expect(await today(page, "댓글")).toBeGreaterThan(before.comments);
    await expect(page.getByRole("table", { name: "최근 7일 가입·발행" })).toBeVisible();
  });

  test("주제 소분류 추가 → 글쓰기 발행 설정에 보임 → 숨겨서 정리(AS4, #12)", async ({ page }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    await page.goto("/admin/topics");
    const create = page.getByRole("group", { name: "주제 추가" });
    await create.getByLabel("위치").selectOption({ label: "스포츠" });
    await create.getByLabel("주소(slug)").fill(topicSlug);
    for (const label of ["이름(한국어)", "이름(English)", "이름(日本語)", "이름(简体中文)"]) {
      await create.getByLabel(label).fill(topicName);
    }
    await create.getByRole("button", { name: "추가" }).click();
    await expect(page.getByRole("status")).toHaveText("주제를 추가했습니다.");

    await logOut(page);
    await logIn(page, writer);
    await page.goto(`/${writer.handle}/write`);
    await page.getByRole("button", { name: "완료" }).click();
    const topic = page
      .getByRole("dialog", { name: "발행 설정" })
      .getByRole("combobox", { name: "주제" });
    await expect(topic.locator("option", { hasText: topicName })).toHaveCount(1);

    await logOut(page);
    await asAdmin(page);
    await page.goto("/admin/topics");
    await page
      .getByRole("region", { name: topicName })
      .getByRole("button", { name: "숨기기" })
      .click();
    await expect(page.getByRole("status")).toHaveText("주제를 숨겼습니다.");
  });

  test("일반 회원은 콘솔 화면·관리자 API 404, 비로그인은 로그인으로(AS2, SC-015, #13·#14)", async ({
    browser,
    page,
  }) => {
    await logIn(page, writer);
    await expect(
      page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "시스템 관리" }),
    ).toHaveCount(0);
    for (const path of ["/admin", "/admin/contents/posts", "/admin/release-notes"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("페이지를 찾을 수 없습니다");
    }
    expect((await callApi(page.request, "GET", "/admin/dashboard")).status).toBe(404);

    const context = await newGuestContext(browser);
    const guest = await context.newPage();
    // 비로그인은 로그인 화면으로(003 콘솔 공통 규칙), 관리자 API는 존재도 숨긴다(404)
    await guest.goto("/admin/release-notes");
    await expect(guest).toHaveURL(/\/login\?next=%2Fadmin%2Frelease-notes$/);
    expect((await callApi(guest.request, "GET", "/admin/dashboard")).status).toBe(404);
    await context.close();
  });

  test("콘텐츠 관리에서 블로그 주소·제목으로 방금 쓴 글과 댓글 찾기(#15·#16)", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin");
    await page
      .getByRole("navigation", { name: "관리자 메뉴" })
      .getByRole("link", { name: "콘텐츠 관리" })
      .click();
    await expect(page).toHaveURL(/\/admin\/contents\/posts$/);
    const search = page.getByRole("search", { name: "찾기" });
    await search.getByLabel("블로그 주소").fill(writer.handle);
    await search.getByLabel("제목").fill(title);
    await search.getByRole("button", { name: "찾기" }).click();
    await expect(page).toHaveURL(new RegExp(`handle=${writer.handle}`));
    const table = page.getByRole("table", { name: "콘텐츠 목록" });
    await expect(table.getByRole("link", { name: title })).toHaveAttribute(
      "href",
      new RegExp(`^/${writer.handle}/\\d+$`),
    );
    await expect(table.getByRole("row")).toHaveCount(2);

    await page
      .getByRole("navigation", { name: "콘텐츠 종류" })
      .getByRole("link", { name: "댓글" })
      .click();
    await expect(page).toHaveURL(/\/admin\/contents\/comments$/);
    const comments = page.getByRole("search", { name: "찾기" });
    await comments.getByLabel("블로그 주소").fill(writer.handle);
    await comments.getByLabel("내용").fill("콘솔 댓글");
    await comments.getByRole("button", { name: "찾기" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/contents/comments\\?.*handle=${writer.handle}`),
    );
    const found = page.getByRole("table", { name: "콘텐츠 목록" });
    await expect(found.getByRole("row")).toHaveCount(2);
    await expect(found.getByRole("link", { name: /콘솔 댓글/ })).toHaveAttribute(
      "href",
      new RegExp(`^/${writer.handle}/\\d+#comment-\\d+$`),
    );
  });

  test("예약어 목록에 admin, 서비스 설정은 읽기 전용 값(#17·#19)", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin/reserved-handles");
    await expect(page.getByRole("heading", { level: 1, name: "예약어" })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "예약어 목록" }).getByText("admin", { exact: true }),
    ).toBeVisible();

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { level: 1, name: "서비스 설정" })).toBeVisible();
    const settings = page.getByRole("table", { name: "서비스 설정 값" });
    await expect(settings.getByRole("row", { name: /blog\.media\.max-size/ })).toContainText("MB");
    // CI는 BLOG_ADMIN_DASHBOARD_CACHE_TTL=0s로 띄운다.
    await expect(
      settings.getByRole("row", { name: /blog\.admin\.dashboard-cache-ttl/ }),
    ).toContainText("끔");
    await expect(page.getByRole("textbox")).toHaveCount(0);
  });
});
