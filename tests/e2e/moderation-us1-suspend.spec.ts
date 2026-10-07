import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  adminRequest,
  callApi,
  logIn,
  logInWith,
  logOut,
  newAccount,
  newGuestContext,
  PASSWORD,
  publishPost,
  requireAdmin,
  requireBackend,
  requireModerationTestSettings,
  signUp,
} from "./support/backend.js";

/**
 * 005 US1 회원 정지(quickstart #8·9, T049): 관리자가 /admin/users에서 닉네임으로 C를 찾아 정지하면(확인 대화상자) C의 로그인
 * 상태가 끊기고(/me 401) 다시 로그인할 수 없으며, 비회원에게 C의 블로그·글 주소는 "이용이 제한된 블로그"(404). 정지를 풀면
 * 블로그가 다시 보인다. 공용 DB를 쓰므로 끝에서 정지가 남아 있으면 푼다.
 */
test.describe("005 US1 회원 정지", () => {
  requireBackend();
  requireModerationTestSettings();
  requireAdmin();
  test.describe.configure({ mode: "serial" });

  const target = newAccount("rs");
  const title = `정지될 회원의 글 ${target.handle.slice(-6)}`;
  let userId = 0;
  let postId = 0;

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logOut(page);
    await logInWith(page, email, password);
  }

  test.afterAll(async ({ playwright }) => {
    if (userId === 0) {
      return;
    }
    const admin = await adminRequest(playwright);
    await callApi(admin, "POST", `/admin/users/${userId}/unsuspend`, {});
    await admin.dispose();
  });

  test("관리자가 닉네임으로 찾아 정지하면 C의 세션이 끊기고 로그인할 수 없다(#8)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const member = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      locale: "ko-KR",
    });
    const memberPage = await member.newPage();
    await signUp(memberPage, target);
    postId = await publishPost(memberPage.request, target.handle, {
      title,
      contentMarkdown: "정지 전에 쓴 글입니다.",
    });
    const me = await callApi<{ userId: number }>(memberPage.request, "GET", "/me");
    expect(me.status).toBe(200);
    userId = me.body.result.userId;

    await asAdmin(page);
    await page.goto("/admin/users");
    const search = page.getByRole("group", { name: "회원 찾기" });
    await search.getByLabel("찾는 방법").selectOption({ label: "닉네임(앞부분)" });
    await search.getByLabel("검색어").fill(target.nickname);
    await search.getByRole("button", { name: "찾기" }).click();
    await page
      .getByRole("table", { name: "회원 목록" })
      .getByRole("link", { name: target.nickname })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `회원 상세: ${target.nickname}`,
    );

    await page.getByLabel("정지 사유").fill("E2E 정지 확인");
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toBe("이 회원을 정지할까요? 로그인이 모두 끊깁니다.");
      void dialog.accept();
    });
    await page.getByRole("button", { name: "정지", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("회원을 정지했습니다.");
    await expect(page.getByRole("button", { name: "정지 해제" })).toBeVisible();

    const after = await callApi(memberPage.request, "GET", "/me");
    expect(after.status).toBe(401);
    await member.close();

    await logOut(page);
    await page.goto("/login");
    await page.getByLabel("이메일").fill(target.email);
    await page.getByLabel("비밀번호").fill(PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("비회원에게 C의 블로그·글 주소는 이용이 제한된 블로그(404)(#9)", async ({ browser }) => {
    const guest = await newGuestContext(browser);
    const page = await guest.newPage();
    for (const path of [`/${target.handle}`, `/${target.handle}/${postId}`]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "이용이 제한된 블로그" })).toBeVisible();
      await expect(page.getByText(title)).toHaveCount(0);
    }
    await guest.close();
  });

  test("정지를 풀면 블로그가 다시 보이고 로그인할 수 있다", async ({ page, browser }) => {
    await asAdmin(page);
    await page.goto(`/admin/users/${userId}`);
    await page.getByRole("button", { name: "정지 해제" }).click();
    await expect(page.getByRole("status")).toHaveText("정지를 해제했습니다.");

    const guest = await newGuestContext(browser);
    const guestPage = await guest.newPage();
    const response = await guestPage.goto(`/${target.handle}/${postId}`);
    expect(response?.status()).toBe(200);
    await expect(guestPage.getByRole("heading", { level: 1 })).toHaveText(title);
    await guest.close();

    await logOut(page);
    await logIn(page, target);
  });
});
