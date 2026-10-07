import { expect, test, type APIRequestContext } from "@playwright/test";

import {
  PASSWORD,
  adminAccount,
  adminRequest,
  callApi,
  logInWith,
  logOut,
  newAccount,
  publishPost,
  requireAdmin,
  requireBackend,
  requireModerationTestSettings,
  signUp,
  uniqueText,
} from "./support/backend.js";

/**
 * 005 US2 스팸 방어(quickstart #23~#26, T074): 관리자가 실행마다 고유한 금칙어 두 개(이름류 거부, 본문류 가림)를 더하면
 * 그 단어가 든 닉네임으로 가입이 거부되고 회원 댓글은 가려져 저장된다. 같은 문구 댓글 3개 뒤 4번째는 반복 스팸으로 거부.
 * CAPTCHA 토큰 없는 가입 API는 400 CAPTCHA_FAILED. 관리자가 /admin/spam에서 댓글 한도를 바꾸고 기본값으로 되돌린다
 * (한도 넘김 자체는 단위 테스트가 본다). 끝나면 금칙어를 지운다.
 */
test.describe("005 US2 스팸 방어", () => {
  requireBackend();
  requireModerationTestSettings();
  requireAdmin();
  test.describe.configure({ mode: "serial" });

  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const nameWord = `밴닉${suffix}`;
  const maskWord = `가림${suffix}`;
  const member = newAccount("sa");
  const spammer = newAccount("sb");
  let admin: APIRequestContext;
  let postId = 0;

  test.beforeAll(async ({ playwright }) => {
    admin = await adminRequest(playwright);
  });

  test.afterAll(async () => {
    // 이 실행이 더한 금칙어를 지운다(다른 시나리오의 가입·댓글에 걸리지 않게)
    for (const word of [nameWord, maskWord]) {
      const list = await callApi<{ id: number; word: string }[]>(
        admin,
        "GET",
        `/admin/banned-words?q=${encodeURIComponent(word)}`,
      );
      for (const found of list.body?.result ?? []) {
        if (found.word === word.toLowerCase()) {
          await callApi(admin, "DELETE", `/admin/banned-words/${found.id}`);
        }
      }
    }
    await admin.dispose();
  });

  test("관리자가 /admin/spam에서 이름류 금칙어를 더하고, 본문류 가림 금칙어는 API로(#23)", async ({
    page,
  }) => {
    const { email, password } = adminAccount();
    await logInWith(page, email, password);
    await page.goto("/admin/spam");
    const add = page.locator("form.banned-word-add");
    await add.getByLabel("금칙어").fill(nameWord);
    await add.getByLabel("적용 범위").selectOption("NAME");
    // 이름류는 가릴 수 없다
    await expect(add.getByRole("option", { name: "가림" })).toBeDisabled();
    await add.getByRole("button", { name: "추가" }).click();
    await expect(add.getByRole("status")).toHaveText("금칙어를 추가했습니다.");

    await page.getByRole("searchbox", { name: "금칙어 검색" }).fill(nameWord);
    await page.getByRole("button", { name: "검색" }).click();
    const row = page
      .getByRole("table")
      .getByRole("row")
      .filter({ hasText: nameWord.toLowerCase() });
    await expect(row).toHaveCount(1);
    await expect(row.getByLabel("적용 범위")).toHaveValue("NAME");

    const created = await callApi(admin, "POST", "/admin/banned-words", {
      word: maskWord,
      scope: "CONTENT",
      action: "MASK",
    });
    expect(created.status).toBe(201);
  });

  test("이름류 금칙어가 든 닉네임으로는 가입할 수 없다(#24)", async ({ page }) => {
    await logOut(page);
    const banned = newAccount("sc");
    await page.goto("/signup");
    await page.getByLabel("이메일").fill(banned.email);
    await page.getByLabel("비밀번호", { exact: true }).fill(PASSWORD);
    await page.getByLabel("닉네임").fill(`a ${nameWord} b`);
    await page.getByLabel("블로그 주소").fill(banned.handle);
    await page.getByLabel("이용약관에 동의합니다(필수)").check();
    await page.getByLabel("개인정보 수집·이용에 동의합니다(필수)").check();
    await page.getByLabel("만 14세 이상입니다(필수)").check();
    // 시험 모드 CAPTCHA가 폼에 있다
    await expect(page.getByRole("group", { name: "자동 등록 방지" })).toContainText("시험 모드");
    await page.getByRole("button", { name: "가입하기" }).click();

    await expect(page.getByText("사용할 수 없는 단어가 있습니다.")).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
  });

  test("CAPTCHA 토큰 없는 가입 API는 400 CAPTCHA_FAILED(#26)", async ({ request }) => {
    const terms = await callApi<{ version: string }>(request, "GET", "/legal/terms");
    const account = newAccount("sd");
    const response = await callApi(request, "POST", "/auth/signup", {
      email: account.email,
      password: PASSWORD,
      nickname: account.nickname,
      handle: account.handle,
      agreeTerms: true,
      agreePrivacy: true,
      over14: true,
      termsVersion: terms.body.result.version,
    });
    expect(response.status).toBe(400);
    expect(response.body.header.resultCode).toBe("CAPTCHA_FAILED");
  });

  test("본문류 가림 금칙어가 든 회원 댓글은 같은 길이 *로 가려져 저장된다(#24)", async ({
    page,
  }) => {
    await logOut(page);
    await signUp(page, member);
    postId = await publishPost(page.request, member.handle, {
      title: `금칙어 시험 글 ${suffix}`,
      contentMarkdown: "댓글로 금칙어를 시험하는 글입니다.",
    });

    await page.goto(`/${member.handle}/${postId}`);
    const form = page.getByRole("form", { name: "댓글 내용" });
    await form.getByLabel("댓글 내용").fill(`앞말 ${maskWord} 뒷말`);
    await form.getByRole("button", { name: "댓글 등록" }).click();

    const list = page.getByRole("list", { name: "댓글 목록" });
    await expect(list).toContainText(`앞말 ${"*".repeat(maskWord.length)} 뒷말`);
    await expect(list).not.toContainText(maskWord);
  });

  test("같은 문구 댓글 3개 뒤 4번째는 반복 스팸으로 거부(#25, FR-144)", async ({ page }) => {
    await logOut(page);
    await signUp(page, spammer);
    const text = uniqueText("같은 문구를 되풀이하는 댓글");
    for (let i = 0; i < 3; i++) {
      const ok = await callApi(page.request, "POST", `/posts/${postId}/comments`, {
        content: text,
      });
      expect(ok.status, `댓글 ${i + 1}`).toBe(201);
    }
    // 공백·대소문자만 다른 내용도 같은 내용으로 센다
    const fourth = await callApi(page.request, "POST", `/posts/${postId}/comments`, {
      content: `  ${text.toUpperCase()}  `,
    });
    expect(fourth.status).toBe(422);
    expect(fourth.body.header.resultCode).toBe("DUPLICATE_CONTENT_SPAM");

    // 화면에서도 같은 문구를 쓰면 안내
    await page.goto(`/${member.handle}/${postId}`);
    const form = page.getByRole("form", { name: "댓글 내용" });
    await form.getByLabel("댓글 내용").fill(text);
    await form.getByRole("button", { name: "댓글 등록" }).click();
    await expect(page.getByText("같은 내용을 짧은 시간에 여러 번 쓸 수 없습니다.")).toBeVisible();
  });

  test("관리자가 /admin/spam에서 댓글 한도를 바꾸고 기본값으로 되돌린다(#26)", async ({ page }) => {
    const { email, password } = adminAccount();
    await logOut(page);
    await logInWith(page, email, password);
    await page.goto("/admin/spam");

    const comment = page.getByRole("region", { name: "댓글(1분)" });
    const limit = comment.getByLabel(/한도/);
    const defaultText = (await comment.getByText(/^기본값: \d+$/).textContent()) ?? "";
    const defaultValue = defaultText.replace(/\D/g, "");
    const next = String(Number(defaultValue) + 500);

    await limit.fill(next);
    await comment.getByRole("button", { name: "저장" }).click();
    await expect(comment.getByRole("status")).toHaveText("설정을 저장했습니다.");
    await expect(limit).toHaveValue(next);
    await expect(comment).toContainText("님이");

    await comment.getByRole("button", { name: "기본값으로" }).click();
    await expect(comment.getByRole("status")).toHaveText("기본값으로 되돌렸습니다.");
    await expect(limit).toHaveValue(defaultValue);
    await expect(comment).toContainText("기본값을 쓰고 있습니다.");
  });
});
