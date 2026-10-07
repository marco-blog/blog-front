import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * backend가 필요한 E2E 시나리오의 공통 도구.
 * E2E_BACKEND_URL이 있을 때만 돈다. CI(backend 없음)에서는 건너뛴다.
 * 돌릴 때는 front 서버가 같은 backend를 보도록 playwright.config.ts가 BLOG_BACKEND_URL로 넘긴다.
 */
export const backendUrl = process.env.E2E_BACKEND_URL;

export function requireBackend() {
  test.skip(!backendUrl, "E2E_BACKEND_URL이 없으면 backend가 필요한 시나리오는 건너뛴다.");
}

/**
 * 포털(003) 시나리오는 backend를 시험용 운영 설정으로 띄웠을 때만 돈다: 캐시 끔(BLOG_PORTAL_CACHE_TTL=0s), 가입 후 대기 없음
 * (BLOG_PORTAL_NEW_MEMBER_DELAY=PT0S), 주제 탭 자동 숨김 기준 1편(BLOG_PORTAL_TOPIC_AUTO_HIDE_THRESHOLD=1).
 * 그렇게 띄웠다는 표시로 E2E_PORTAL_TEST_SETTINGS=1을 준다.
 */
export function requirePortalTestSettings() {
  test.skip(
    process.env.E2E_PORTAL_TEST_SETTINGS !== "1",
    "E2E_PORTAL_TEST_SETTINGS=1(포털 시험용 backend 설정)이 아니면 포털 시나리오는 건너뛴다.",
  );
}

/**
 * 004 비회원 글 시나리오는 backend의 비회원 쓰기 속도 제한을 넉넉히 띄웠을 때만 돈다(같은 IP에서 여러 시나리오가 쓰므로):
 * BLOG_GUEST_COMMENT_PER_MINUTE=1000, BLOG_GUEST_GUESTBOOK_PER_MINUTE=1000. 그렇게 띄웠다는 표시로 E2E_GUEST_TEST_SETTINGS=1을 준다.
 */
export function requireGuestTestSettings() {
  test.skip(
    process.env.E2E_GUEST_TEST_SETTINGS !== "1",
    "E2E_GUEST_TEST_SETTINGS=1(비회원 글 시험용 backend 설정)이 아니면 비회원 시나리오는 건너뛴다.",
  );
}

/** 관리자 계정(E2E_ADMIN_EMAIL·E2E_ADMIN_PASSWORD). 없으면 관리자 시나리오는 건너뛴다. */
export function requireAdmin() {
  test.skip(
    !process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD,
    "E2E_ADMIN_EMAIL·E2E_ADMIN_PASSWORD가 없으면 관리자 시나리오는 건너뛴다.",
  );
}

export function adminAccount() {
  return {
    email: process.env.E2E_ADMIN_EMAIL ?? "",
    password: process.env.E2E_ADMIN_PASSWORD ?? "",
  };
}

/** 포털 최소 길이(기본 200자)를 넘는 본문. n은 문단 수(문단마다 70자 남짓, 최소 4문단) */
export function portalText(n = 4, seed = "포털") {
  return Array.from(
    { length: Math.max(n, 4) },
    (_, i) =>
      `${seed} 본문 ${i + 1}번째 문단입니다. 포털 카드에 나오려면 본문 텍스트가 최소 길이를 넘어야 하므로 문장을 넉넉하게 이어서 씁니다. 끝.`,
  ).join("\n\n");
}

/** `GET /topics` 트리에서 slug(대분류·소분류)의 id. 없으면 시험 실패 */
export async function topicIdBySlug(request: APIRequestContext, slug: string) {
  const tree = await callApi<TopicTreeNode[]>(request, "GET", "/topics");
  expect(tree.status).toBe(200);
  const found = tree.body.result
    .flatMap((major) => [major, ...major.children])
    .find((topic) => topic.slug === slug);
  expect(found, `주제 ${slug}`).toBeTruthy();
  return found!.id;
}

interface TopicTreeNode {
  id: number;
  slug: string;
  children: TopicTreeNode[];
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

/** 이메일·비밀번호로 로그인(관리자 계정 등) */
export async function logInWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logOut(page: Page) {
  await page.context().clearCookies();
}

/** backend 공통 응답 틀(api-guidelines.md 4절) */
interface Envelope<T> {
  header: { isSuccessful: boolean; resultCode: string; resultMessage: string };
  result: T;
}

/** 브라우저 쿠키를 함께 쓰는 API 호출(front 서버의 /api 프록시를 거친다). */
export async function callApi<T>(
  request: APIRequestContext,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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
  post: {
    title: string;
    contentMarkdown: string;
    visibility?: "PUBLIC" | "PRIVATE" | "PROTECTED";
    /** 003 주제(소분류 id) */
    topicId?: number;
    /** 대표 이미지 mediaKey(본문 이미지 중 하나) */
    thumbnail?: string;
    /** 보호 글 비밀번호(004, visibility PROTECTED) */
    password?: string;
    /** 예약 시각(004, ISO). 미래면 SCHEDULED */
    scheduledAt?: string;
    /** 공지(004) */
    notice?: boolean;
  },
) {
  const draft = await callApi<{ id: number }>(request, "POST", `/blogs/${handle}/posts/drafts`, {
    title: post.title,
    contentMarkdown: post.contentMarkdown,
  });
  expect(draft.status).toBe(201);
  const id = draft.body.result.id;
  const published = await callApi(request, "POST", `/posts/${id}/publish`, {
    visibility: post.visibility ?? "PUBLIC",
    commentEnabled: true,
    ...(post.topicId === undefined ? {} : { topicId: post.topicId }),
    ...(post.thumbnail === undefined ? {} : { thumbnailMediaKey: post.thumbnail }),
    ...(post.password === undefined ? {} : { password: post.password }),
    ...(post.scheduledAt === undefined ? {} : { scheduledAt: post.scheduledAt }),
    ...(post.notice === undefined ? {} : { notice: post.notice }),
  });
  expect(published.status).toBe(200);
  return id;
}

/** 블로그 설정을 바꾼다(PATCH /blogs/{handle}, 주인으로 로그인한 request). 예: `{ guestbookEnabled: false }` */
export async function setBlogSettings(
  request: APIRequestContext,
  handle: string,
  patch: Record<string, unknown>,
) {
  const response = await callApi(request, "PATCH", `/blogs/${handle}`, patch);
  expect(response.status, `PATCH /blogs/${handle}`).toBe(200);
  return response.body.result;
}

/**
 * 주소가 200이 될 때까지 다시 부른다(예약 발행·백업 같은 배치 작업 기다리기). path가 `/api/`로 시작하면 API, 아니면 화면.
 * 기본 90초(예약 발행 주기 30초 + 여유).
 */
export async function waitForPublic(request: APIRequestContext, path: string, timeoutMs = 90_000) {
  await expect
    .poll(async () => (await request.get(path, { failOnStatusCode: false })).status(), {
      timeout: timeoutMs,
      intervals: [1_000, 2_000, 5_000],
    })
    .toBe(200);
}

/** 로그인하지 않은 새 브라우저 컨텍스트(비회원·다른 방문자). 쓰고 나면 `context.close()` */
export async function newGuestContext(browser: Browser): Promise<BrowserContext> {
  const baseURL = test.info().project.use.baseURL;
  return browser.newContext({ baseURL, locale: "ko-KR" });
}
