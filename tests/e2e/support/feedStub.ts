import { request as playwrightRequest } from "@playwright/test";

/**
 * 007 외부 블로그 시나리오의 피드 스텁 도구(research E18). 스텁 서버(tests/e2e/support/feed-stub-server.mjs)는
 * playwright.config.ts의 webServer로 함께 뜨고 127.0.0.1에만 바인딩한다. 시나리오는 인터넷 대신 이 서버의 피드를 등록한다.
 */
export const FEED_STUB_PORT = Number(process.env.E2E_FEED_STUB_PORT ?? 4610);
export const FEED_STUB_BASE = `http://127.0.0.1:${FEED_STUB_PORT}`;

export interface StubItem {
  n?: number;
  title: string;
  publishedAt?: string;
  categories?: string[];
  image?: boolean;
  summary?: string;
}

export interface StubBlog {
  title?: string;
  items?: StubItem[];
  verifyCode?: string | null;
  status?: number | null;
}

let counter = 0;

/** 시나리오마다 겹치지 않는 스텁 블로그 이름(영문 소문자·숫자). */
export function uniqueStubName(prefix = "f") {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}${Math.floor(Math.random() * 1000)}`;
}

/** 스텁 블로그 주소. kind가 feed면 RSS, atom이면 Atom, site면 블로그 첫 화면(HTML). */
export function stubUrl(name: string, kind: "feed" | "atom" | "site" = "feed") {
  if (kind === "site") return `${FEED_STUB_BASE}/${name}/`;
  return `${FEED_STUB_BASE}/${name}/${kind === "atom" ? "atom.xml" : "feed.xml"}`;
}

/** 원문 글 주소(피드 항목의 link). */
export function stubPostUrl(name: string, n: number) {
  return `${FEED_STUB_BASE}/${name}/posts/${n}`;
}

async function call(method: string, path: string, data?: unknown) {
  const ctx = await playwrightRequest.newContext();
  try {
    const res = await ctx.fetch(`${FEED_STUB_BASE}${path}`, {
      method,
      data: data === undefined ? undefined : data,
      headers: data === undefined ? undefined : { "Content-Type": "application/json" },
    });
    if (!res.ok()) throw new Error(`feed stub ${method} ${path} -> ${res.status()}`);
    return (await res.json()) as unknown;
  } finally {
    await ctx.dispose();
  }
}

/** 스텁 블로그 상태를 정한다(덮어씀). 이름을 돌려준다. */
export async function stubFeed(name: string, blog: StubBlog = {}) {
  await call("POST", `/__stub/${name}`, blog);
  return name;
}

/** 글 하나를 맨 앞에 더한다. 붙은 번호를 돌려준다. */
export async function addItem(name: string, item: StubItem) {
  const added = (await call("POST", `/__stub/${name}/items`, item)) as { n: number };
  return added.n;
}

/** 원문 글을 지운다(이후 404). */
export async function removePost(name: string, n: number) {
  await call("DELETE", `/__stub/${name}/posts/${n}`);
}

/** 피드 응답 상태를 강제한다(null이면 정상). 나머지 상태는 그대로 둔다. */
export async function setStatus(name: string, status: number | null, current: StubBlog = {}) {
  await call("POST", `/__stub/${name}`, { ...current, status });
}

/** 경로별 요청 수. */
export async function hits(name: string) {
  return (await call("GET", `/__stub/${name}/hits`)) as Record<string, number>;
}
