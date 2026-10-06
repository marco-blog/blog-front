import { expect, test, type Page } from "@playwright/test";

import { newAccount, PASSWORD, requireBackend, signUp } from "./support/backend.js";

/**
 * 계정 설정(T135, quickstart): 로그인 기록, 비밀번호 변경(다른 기기 로그아웃), 메일로 비밀번호 재설정.
 * backend와 메일 확인용 Mailpit이 모두 있을 때만 돈다(E2E_BACKEND_URL, MAILPIT_URL).
 * backend는 Mailpit SMTP로 메일을 보내도록 띄운다(BLOG_MAIL_HOST·BLOG_MAIL_PORT).
 */
const mailpitUrl = process.env.MAILPIT_URL;

test.describe("US1 계정 설정", () => {
  requireBackend();
  test.skip(!mailpitUrl, "MAILPIT_URL이 없으면 메일이 필요한 시나리오는 건너뛴다.");
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("a");
  const CHANGED = "e2e-changed-5678";
  const RESET = "e2e-reset-9012";

  async function login(page: Page, password: string) {
    await page.goto("/login");
    await page.getByLabel("이메일").fill(owner.email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "로그인" }).click();
  }

  /** 받은 재설정 메일 본문에서 token을 꺼낸다. 메일은 비동기로 나가므로 올 때까지 기다린다. */
  async function resetToken(email: string) {
    let token: string | undefined;
    await expect
      .poll(
        async () => {
          const search = await fetch(
            `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          );
          const { messages } = (await search.json()) as { messages: { ID: string }[] };
          const [latest] = messages;
          if (!latest) return undefined;
          const message = (await (
            await fetch(`${mailpitUrl}/api/v1/message/${latest.ID}`)
          ).json()) as {
            Text: string;
          };
          token = /token=([A-Za-z0-9_-]+)/.exec(message.Text)?.[1];
          return token;
        },
        { timeout: 15_000 },
      )
      .toBeTruthy();
    return token as string;
  }

  test("로그인 기록: 실패·성공 시도가 IP 일부를 가린 채 최신순으로 보인다", async ({ page }) => {
    await signUp(page, owner);
    await page.context().clearCookies();

    await login(page, "wrong-pass-0000");
    await expect(page.getByRole("alert")).toBeVisible();
    await login(page, PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/settings/login-history");
    await expect(page.getByRole("heading", { name: "로그인 기록" })).toBeVisible();
    const rows = page.locator("table.login-history tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator("td").nth(1)).toHaveText("성공");
    await expect(rows.nth(1).locator("td").nth(1)).toHaveText("실패");
    // 원래 IP는 보이지 않는다(IPv4 a.b.*.*, IPv6 앞 3블록).
    await expect(rows.nth(0).locator("td").nth(2)).toHaveText(/\*|:/);
  });

  test("비밀번호 변경: 현재 비밀번호 확인, 다른 기기는 로그아웃, 이 기기는 유지", async ({
    page,
    browser,
  }) => {
    // 다른 기기
    const otherContext = await browser.newContext();
    const other = await otherContext.newPage();
    await other.goto("/login");
    await other.getByLabel("이메일").fill(owner.email);
    await other.getByLabel("비밀번호").fill(PASSWORD);
    await other.getByRole("button", { name: "로그인" }).click();
    await expect(other).not.toHaveURL(/\/login/);

    await login(page, PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto("/settings/password");

    await page.getByLabel("현재 비밀번호").fill("wrong-pass-0000");
    await page.getByLabel("새 비밀번호", { exact: true }).fill(CHANGED);
    await page.getByLabel("새 비밀번호 확인").fill(CHANGED);
    await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
    await expect(page.getByText("비밀번호가 맞지 않습니다.")).toBeVisible();

    await page.getByLabel("현재 비밀번호").fill(PASSWORD);
    await page.getByLabel("새 비밀번호", { exact: true }).fill(CHANGED);
    await page.getByLabel("새 비밀번호 확인").fill(CHANGED);
    await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "비밀번호를 바꿨습니다. 다른 기기에서는 로그아웃되었습니다.",
    );

    // 다른 기기: 접근 토큰이 만료되면 리프레시가 거절되어 로그인 화면으로 간다.
    await otherContext.clearCookies({ name: "access_token" });
    await other.goto("/settings/profile");
    await expect(other).toHaveURL(/\/login/);
    await otherContext.close();

    // 이 기기: 접근 토큰이 만료돼도 갱신되어 계속 로그인 상태다.
    await page.context().clearCookies({ name: "access_token" });
    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByLabel("닉네임")).toHaveValue(owner.nickname);
  });

  test("비밀번호 재설정: 메일 링크로 한 번만 바꾸고 새 비밀번호로 로그인한다", async ({ page }) => {
    await page.goto("/password-reset");
    await page.getByLabel("이메일").fill(owner.email);
    await page.getByRole("button", { name: "재설정 링크 받기" }).click();
    await expect(page.getByRole("status")).toContainText("입력한 이메일로 가입한 계정이 있으면");

    const token = await resetToken(owner.email);
    const link = `/password-reset/confirm?token=${token}`;
    await page.goto(link);
    await page.getByLabel("새 비밀번호", { exact: true }).fill(RESET);
    await page.getByLabel("새 비밀번호 확인").fill(RESET);
    await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
    await expect(page.getByRole("status")).toContainText("새 비밀번호로 바꿨습니다.");

    // 같은 링크는 다시 쓸 수 없다.
    await page.goto(link);
    await page.getByLabel("새 비밀번호", { exact: true }).fill(RESET);
    await page.getByLabel("새 비밀번호 확인").fill(RESET);
    await page.getByRole("button", { name: "비밀번호 바꾸기" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.",
    );

    await login(page, CHANGED);
    await expect(page.getByRole("alert")).toBeVisible();
    await login(page, RESET);
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("가입하지 않은 이메일도 같은 안내를 받는다", async ({ page }) => {
    await page.goto("/password-reset");
    await page.getByLabel("이메일").fill(`nobody-${owner.handle}@example.test`);
    await page.getByRole("button", { name: "재설정 링크 받기" }).click();
    await expect(page.getByRole("status")).toContainText("입력한 이메일로 가입한 계정이 있으면");
  });
});
