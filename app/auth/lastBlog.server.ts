import { addResponseCookie } from "~/api/backendCookies.server";
import { readCookie } from "~/i18n/language";

/**
 * 최근에 쓴 블로그(contracts/routes.md): `/:handle/write/**`·`/:handle/manage/**`를 열 때 저장하고,
 * 상단 진입점 `/write`·`/manage`가 내 블로그 중 하나일 때만 쓴다(서버 저장 없음).
 */
export const LAST_BLOG_COOKIE = "last_blog";
/** 1년 */
export const LAST_BLOG_MAX_AGE = 60 * 60 * 24 * 365;

export function lastBlogCookie(handle: string, secure = process.env.NODE_ENV === "production") {
  return `${LAST_BLOG_COOKIE}=${encodeURIComponent(handle)}; Path=/; Max-Age=${LAST_BLOG_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function rememberLastBlog(request: Request, handle: string): void {
  addResponseCookie(request, lastBlogCookie(handle));
}

export function readLastBlog(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), LAST_BLOG_COOKIE);
}

/** 블로그가 1개면 그 블로그, 여러 개면 last_blog가 내 블로그일 때 그 블로그, 아니면 null(블로그 선택 화면) */
export function chooseBlog(handles: readonly string[], lastBlog: string | null): string | null {
  if (handles.length === 1) {
    return handles[0];
  }
  return lastBlog && handles.includes(lastBlog) ? lastBlog : null;
}
