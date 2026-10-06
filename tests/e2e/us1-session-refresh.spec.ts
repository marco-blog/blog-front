import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { newAccount, PASSWORD, requireBackend, signUp } from "./support/backend.js";

/**
 * 접근 토큰이 만료된 채로 들어온 요청(tasks.md "구현 전 결정 사항" 1번, quickstart #7).
 * front 서버가 들어온 리프레시 쿠키로 한 번 갱신하고, 새 쿠키를 브라우저 응답에 실어야 한다.
 * 한 요청 안에서 action과 그 뒤 다시 읽는 loader(revalidation)가 함께 도는 경우도 확인한다.
 * 접근 토큰 만료는 브라우저에서 access_token 쿠키만 지워서 흉내 낸다.
 */
test.describe("US1 접근 토큰 만료 후 SSR 갱신", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("r");

  async function tokens(context: BrowserContext) {
    const cookies = await context.cookies();
    return {
      access: cookies.find((cookie) => cookie.name === "access_token")?.value,
      refresh: cookies.find((cookie) => cookie.name === "refresh_token")?.value,
    };
  }

  /** 접근 토큰만 지운다. 리프레시 쿠키는 남는다. */
  async function expireAccess(context: BrowserContext) {
    const before = await tokens(context);
    expect(before.refresh).toBeTruthy();
    await context.clearCookies({ name: "access_token" });
    return before.refresh;
  }

  async function login(page: Page) {
    await page.goto("/login");
    await page.getByLabel("이메일").fill(owner.email);
    await page.getByLabel("비밀번호").fill(PASSWORD);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).not.toHaveURL(/\/login/);
  }

  test("화면 요청(loader): 갱신된 쿠키를 받고 로그인 상태로 보인다", async ({ page, context }) => {
    await signUp(page, owner);
    const oldRefresh = await expireAccess(context);

    const response = await page.goto("/settings/blogs");

    expect(response?.status()).toBe(200);
    await expect(page.getByText("블로그 1 / 3")).toBeVisible();
    const after = await tokens(context);
    expect(after.access).toBeTruthy();
    expect(after.refresh).toBeTruthy();
    expect(after.refresh).not.toBe(oldRefresh);
  });

  test("JS로 보낸 action과 그 뒤 revalidation이 모두 로그인 상태로 돈다", async ({
    page,
    context,
  }) => {
    await login(page);
    await page.goto("/settings/blogs");
    const oldRefresh = await expireAccess(context);

    await page.getByLabel("블로그 주소").fill(`${owner.handle}-js`);
    await expect(page.getByText("사용할 수 있는 주소입니다.")).toBeVisible();
    await page.getByRole("button", { name: "만들기" }).click();

    await expect(page.getByRole("status")).toHaveText("블로그를 만들었습니다.");
    await expect(page.getByText("블로그 2 / 3")).toBeVisible();
    const after = await tokens(context);
    expect(after.access).toBeTruthy();
    expect(after.refresh).not.toBe(oldRefresh);

    // 갱신된 쿠키로 다음 화면도 로그인 상태다.
    await page.reload();
    await expect(page.getByText("블로그 2 / 3")).toBeVisible();
  });

  test("JS 없는 폼 POST: action과 loader가 한 요청에서 돌아도 로그인 상태가 유지된다", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await login(page);
    await page.goto("/settings/blogs");
    const oldRefresh = await expireAccess(context);

    await page.getByLabel("블로그 주소").fill(`${owner.handle}-nojs`);
    await page.getByRole("button", { name: "만들기" }).click();

    await expect(page.getByRole("status")).toHaveText("블로그를 만들었습니다.");
    await expect(page.getByText("블로그 3 / 3")).toBeVisible();
    const after = await tokens(context);
    expect(after.access).toBeTruthy();
    expect(after.refresh).not.toBe(oldRefresh);

    // 리프레시 재사용 유예(10초)가 지난 뒤에도 브라우저에 남은 쿠키로 계속 로그인 상태여야 한다.
    await page.waitForTimeout(11_000);
    await context.clearCookies({ name: "access_token" });
    const next = await page.goto("/settings/blogs");
    expect(next?.status()).toBe(200);
    await expect(page.getByText("블로그 3 / 3")).toBeVisible();
    await context.close();
  });
});
