import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  PASSWORD,
  backendUrl,
  callApi,
  newAccount,
  publishPost,
  requireBackend,
  signUp,
} from "./support/backend.js";

/**
 * US5 내 언어로 서비스 이용하기 Independent Test(T231, quickstart #26~28):
 * 브라우저 언어 ja로 첫 방문 → 일본어 → 하단에서 English → 같은 주소가 영어, 로그인 후 다른 브라우저에서도 영어,
 * 일본어 화면에서 한국어 글 본문은 그대로(AS4), 4개 언어 오류 문구, 시간대 설정, 영어 회원의 재설정 메일(AS5),
 * 번역 키가 화면에 나오지 않음(AS6).
 * 언어 선택 시나리오는 backend 없이도 돌고, 회원·글·오류 시나리오는 E2E_BACKEND_URL, 메일은 MAILPIT_URL이 있어야 돈다.
 */
const LANGUAGES = ["ko", "en", "ja", "zh-CN"] as const;
type Language = (typeof LANGUAGES)[number];

const LOCALES_DIR = join(import.meta.dirname, "../../app/locales");
function messages(language: Language, namespace: string): Record<string, never> {
  return JSON.parse(readFileSync(join(LOCALES_DIR, language, `${namespace}.json`), "utf-8"));
}
const t = (language: Language, namespace: string, path: string): string =>
  path
    .split(".")
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown>)[key],
      messages(language, namespace),
    ) as string;

/** 화면에 번역 키(예: nav.login, errors:UNKNOWN)가 그대로 나왔는지 */
const KEY_PATTERN =
  /\b(?:(?:common|auth|post|editor|errors|settings|manage|comment|category|tag|media|legal):[A-Za-z]|(?:nav|footer|home|notFound|pagination|login|signup|fieldErrors)\.[a-z][A-Za-z]+\b)/;

async function expectNoKeys(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(KEY_PATTERN);
}

async function chooseLanguage(page: Page, label: string, name: string) {
  await page.getByRole("contentinfo").getByLabel(label).selectOption({ label: name });
}

async function newPage(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext(options);
  return { context, page: await context.newPage() };
}

test.describe("US5 언어 선택(backend 없이도)", () => {
  test("브라우저 언어 ja로 처음 오면 일본어, 하단에서 English를 고르면 같은 주소가 영어로 유지된다", async ({
    browser,
  }) => {
    const { context, page } = await newPage(browser, { locale: "ja-JP" });

    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      t("ja", "auth", "login.title"),
    );
    await expectNoKeys(page);

    await chooseLanguage(page, t("ja", "common", "footer.language"), "English");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Log in");
    expect((await context.cookies()).find((cookie) => cookie.name === "lang")).toMatchObject({
      value: "en",
      httpOnly: true,
      sameSite: "Lax",
    });

    // 다시 와도(새 탭, 새로 고침) 영어
    const again = await context.newPage();
    await again.goto("/signup");
    await expect(again.locator("html")).toHaveAttribute("lang", "en");
    await expect(again.getByRole("heading", { level: 1 })).toHaveText(
      t("en", "auth", "signup.title"),
    );
    await expectNoKeys(again);
    await context.close();
  });

  test("지원하지 않는 브라우저 언어는 영어", async ({ browser }) => {
    const { context, page } = await newPage(browser, { locale: "fr-FR" });

    await page.goto("/login");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("contentinfo").getByLabel("Language")).toHaveValue("en");
    await context.close();
  });

  test("JS 없이도 언어 선택 폼으로 바꾼다", async ({ browser }) => {
    const { context, page } = await newPage(browser, {
      locale: "ko-KR",
      javaScriptEnabled: false,
    });

    await page.goto("/login?next=%2Fsettings");
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");
    const footer = page.getByRole("contentinfo");
    await footer.getByLabel("언어").selectOption("zh-CN");
    await footer.getByRole("button", { name: "변경" }).click();

    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      t("zh-CN", "auth", "login.title"),
    );
    await context.close();
  });
});

test.describe("US5 회원 언어·글·오류", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("i");
  const koreanBody = "한국어로 쓴 본문은 번역하지 않습니다.";
  let postPath = "";

  test("로그인 회원이 하단에서 English를 고르면 회원 설정에 저장되어 다른 브라우저에서도 영어(AS3)", async ({
    page,
    browser,
  }) => {
    await signUp(page, owner);
    const postId = await publishPost(page.request, owner.handle, {
      title: "한국어 글",
      contentMarkdown: koreanBody,
    });
    postPath = `/${owner.handle}/${postId}`;
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");

    await chooseLanguage(page, "언어", "English");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}$`));
    const me = await callApi<{ locale: string }>(page.request, "GET", "/me");
    expect(me.body.result.locale).toBe("en");

    // 다른 브라우저(일본어)에서 로그인해도 회원 설정(영어)이 먼저다.
    const other = await newPage(browser, { locale: "ja-JP" });
    await other.page.goto("/login");
    await expect(other.page.locator("html")).toHaveAttribute("lang", "ja");
    const main = other.page.locator("main");
    await main.getByLabel(t("ja", "auth", "login.email")).fill(owner.email);
    await main.getByLabel(t("ja", "auth", "login.password"), { exact: true }).fill(PASSWORD);
    await main.getByRole("button", { name: t("ja", "auth", "login.submit") }).click();
    await expect(other.page).not.toHaveURL(/\/login/);
    await expect(other.page.locator("html")).toHaveAttribute("lang", "en");
    await expect(other.page.getByRole("button", { name: "Log out" })).toBeVisible();
    await expectNoKeys(other.page);
    await other.context.close();
  });

  test("일본어 화면에서 한국어 글을 열면 메뉴는 일본어, 본문은 쓴 그대로(AS4)", async ({
    browser,
  }) => {
    const { context, page } = await newPage(browser, { locale: "ja-JP" });

    await page.goto(postPath);

    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByRole("banner").getByRole("link", { name: "ログイン" })).toBeVisible();
    await expect(page.locator("article")).toContainText(koreanBody);
    await expect(page.locator("article time").first()).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日$/);
    await expectNoKeys(page);
    await context.close();
  });

  for (const language of LANGUAGES) {
    test(`로그인 실패 오류가 ${language} 문구로 나오고 오류 코드는 나오지 않는다(quickstart #28)`, async ({
      browser,
    }) => {
      const { context, page } = await newPage(browser, { locale: "en-US" });
      await context.addCookies([
        { name: "lang", value: language, url: test.info().project.use.baseURL! },
      ]);

      await page.goto("/login");
      const main = page.locator("main");
      await main.getByLabel(t(language, "auth", "login.email")).fill(owner.email);
      await main
        .getByLabel(t(language, "auth", "login.password"), { exact: true })
        .fill("wrong-pass-0000");
      await main.getByRole("button", { name: t(language, "auth", "login.submit") }).click();

      await expect(page.getByRole("alert")).toHaveText(
        t(language, "errors", "INVALID_CREDENTIALS"),
      );
      await expect(page.locator("html")).toHaveAttribute("lang", language);
      expect(await page.locator("body").innerText()).not.toContain("INVALID_CREDENTIALS");
      await expectNoKeys(page);
      await context.close();
    });
  }

  test("/settings/language에서 시간대를 America/New_York으로 바꾸면 시각이 뉴욕 시간·영어 표기(quickstart #27)", async ({
    page,
  }) => {
    await page.goto("/login");
    const main = page.locator("main");
    await main.getByLabel("이메일").fill(owner.email);
    await main.getByLabel("비밀번호", { exact: true }).fill(PASSWORD);
    await main.getByRole("button", { name: "로그인" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    // 회원 설정(영어)이 브라우저 언어(한국어)보다 먼저다.
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.goto("/settings/language");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Language and time zone");
    await expect(page.getByLabel("Display language")).toHaveValue("en");
    await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Seoul");
    await page.getByLabel("Time zone").selectOption("America/New_York");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Your language and time zone have been saved.",
    );
    const me = await callApi<{ timeZone: string }>(page.request, "GET", "/me");
    expect(me.body.result.timeZone).toBe("America/New_York");

    // 댓글을 달고 글을 열면 작성 시각이 뉴욕 시간·영어 표기다.
    const postId = Number(postPath.split("/").at(-1));
    const comment = await callApi(page.request, "POST", `/posts/${postId}/comments`, {
      content: "time zone check",
    });
    expect(comment.status).toBe(201);
    await page.goto(postPath);
    const time = page.locator("li", { hasText: "time zone check" }).locator("time").first();
    const iso = await time.getAttribute("datetime");
    const expected = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    }).format(new Date(iso!));
    await expect(time).toHaveText(expected);
    await expect(page.locator("article time").first()).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/);

    // 같은 화면에서 언어를 다시 바꾸면 회원 설정도 바뀐다.
    await page.goto("/settings/language");
    await page.getByLabel("Display language").selectOption("zh-CN");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("status")).toHaveText(t("zh-CN", "settings", "language.saved"));
    await expect(page.getByLabel(t("zh-CN", "settings", "language.timeZone"))).toHaveValue(
      "America/New_York",
    );
    await callApi(page.request, "PATCH", "/me", { locale: "en" });
  });
});

test.describe("US5 메일 언어", () => {
  const mailpitUrl = process.env.MAILPIT_URL;
  test.skip(!backendUrl || !mailpitUrl, "E2E_BACKEND_URL과 MAILPIT_URL이 있어야 돈다.");

  async function latestSubject(email: string) {
    let subject: string | undefined;
    await expect
      .poll(
        async () => {
          const search = await fetch(
            `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
          );
          const { messages: found } = (await search.json()) as { messages: { Subject: string }[] };
          subject = found[0]?.Subject;
          return subject;
        },
        { timeout: 15_000 },
      )
      .toBeTruthy();
    return subject;
  }

  for (const [label, locale] of [
    ["영어(en)", "en"],
    ["언어 미설정(NULL)", null],
  ] as const) {
    test(`${label} 회원의 비밀번호 재설정 메일은 영어(AS5)`, async ({ page }) => {
      const member = newAccount("m");
      await signUp(page, member);
      const patched = await callApi(page.request, "PATCH", "/me", { locale });
      expect(patched.status).toBe(200);
      await page.context().clearCookies();

      const requested = await callApi(page.request, "POST", "/auth/password-reset/request", {
        email: member.email,
      });
      expect(requested.status).toBe(202);

      expect(await latestSubject(member.email)).toBe("Reset your password");
    });
  }
});
