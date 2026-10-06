import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * backend가 필요한 E2E 시나리오의 공통 도구.
 * E2E_BACKEND_URL이 있을 때만 돈다. CI(backend 없음)에서는 건너뛴다.
 * 돌릴 때는 front 서버가 같은 backend를 보도록 playwright.config.ts가 BLOG_BACKEND_URL로 넘긴다.
 */
export const backendUrl = process.env.E2E_BACKEND_URL;

export function requireBackend() {
  test.skip(!backendUrl, "E2E_BACKEND_URL이 없으면 backend가 필요한 시나리오는 건너뛴다.");
}

export const PASSWORD = "e2e-pass-1234";

/** 실행마다 겹치지 않는 handle(영문 소문자·숫자 3~20자). 뒤에 "-dev" 등을 붙일 여유를 둔다. */
export function uniqueHandle(prefix = "e") {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return `${prefix}${suffix}`.slice(0, 14);
}

export interface Account {
  email: string;
  nickname: string;
  handle: string;
}

export function newAccount(prefix = "e"): Account {
  const handle = uniqueHandle(prefix);
  return { email: `${handle}@example.test`, nickname: `닉${handle.slice(-6)}`, handle };
}

/** /signup 화면으로 가입한다. 가입하면 바로 로그인되고 /{handle}로 이동한다. */
export async function signUp(page: Page, account: Account) {
  await page.goto("/signup");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(PASSWORD);
  await page.getByLabel("닉네임").fill(account.nickname);
  await page.getByLabel("블로그 주소").fill(account.handle);
  await page.getByLabel("이용약관에 동의합니다(필수)").check();
  await page.getByLabel("개인정보 수집·이용에 동의합니다(필수)").check();
  await page.getByLabel("만 14세 이상입니다(필수)").check();
  await page.getByRole("button", { name: "가입하기" }).click();
  await expect(page).toHaveURL(new RegExp(`/${account.handle}$`));
}

export async function logIn(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(PASSWORD);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logOut(page: Page) {
  await page.context().clearCookies();
}

interface Envelope<T> {
  resultCode: string;
  data: T;
}

/** 브라우저 쿠키를 함께 쓰는 API 호출(front 서버의 /api 프록시를 거친다). */
export async function callApi<T>(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Envelope<T> }> {
  const base = test.info().project.use.baseURL ?? "";
  const response = await request.fetch(`/api/v1${path}`, {
    method,
    headers: { Origin: new URL(base).origin, "Content-Type": "application/json" },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status(), body: (text ? JSON.parse(text) : null) as Envelope<T> };
}

/** 임시저장 후 발행해서 글 번호를 돌려준다(contracts/api.md 글쓰기 순서). */
export async function publishPost(
  request: APIRequestContext,
  handle: string,
  post: { title: string; contentMarkdown: string; visibility?: "PUBLIC" | "PRIVATE" },
) {
  const draft = await callApi<{ id: number }>(request, "POST", `/blogs/${handle}/posts/drafts`, {
    title: post.title,
    contentMarkdown: post.contentMarkdown,
  });
  expect(draft.status).toBe(201);
  const id = draft.body.data.id;
  const published = await callApi(request, "POST", `/posts/${id}/publish`, {
    visibility: post.visibility ?? "PUBLIC",
    commentEnabled: true,
  });
  expect(published.status).toBe(200);
  return id;
}
