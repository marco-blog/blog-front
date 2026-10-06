import { redirect } from "react-router";

import { createApiClient, type ApiClientOptions } from "~/api/client.server";
import { isApiError } from "~/api/errors";

/**
 * GET /api/v1/me 응답(contracts/api.md "회원").
 * 기능 구현 때 backend OpenAPI에서 생성한 타입(app/api/schema.d.ts)으로 바꾼다.
 */
export interface SessionUser {
  userId: number;
  email: string;
  nickname: string;
  bio: string | null;
  profileImageUrl: string | null;
  role: string;
  locale: string;
  timeZone: string;
  blogs: { handle: string; title: string }[];
  unseenReleaseNote: { version: string; title: string } | null;
}

/** 로그인 화면 경로(contracts/routes.md) */
export const LOGIN_PATH = "/login";

/**
 * 로그인한 회원. 들어온 요청의 쿠키(access_token)를 그대로 실어 /api/v1/me를 부르고,
 * 401이면 비로그인(null)이다. 쿠키가 하나도 없으면 backend를 부르지 않는다.
 * 그 밖의 실패(backend 장애 등)는 ApiError로 던진다.
 */
export async function getSessionUser(
  request: Request,
  options?: ApiClientOptions,
): Promise<SessionUser | null> {
  if (!request.headers.get("cookie")) {
    return null;
  }
  try {
    return await createApiClient(request, options).get<SessionUser>("/me");
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      return null;
    }
    throw error;
  }
}

/**
 * 로그인이 필요한 화면의 loader·action에서 부른다.
 * 비로그인이면 지금 주소를 `next`로 붙여 `/login?next=...`로 리다이렉트한다(contracts/routes.md).
 */
export async function requireUser(
  request: Request,
  options?: ApiClientOptions,
): Promise<SessionUser> {
  const user = await getSessionUser(request, options);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(loginPath(`${url.pathname}${url.search}`));
  }
  return user;
}

/** 검사에 쓰는 임시 기준 주소. 이 주소와 출처가 같은 경로만 받는다. */
const SAME_SITE_BASE = "http://same-site.invalid";

/**
 * 로그인 뒤 돌아갈 `next` 값을 같은 사이트의 상대 경로로만 받는다(열린 리다이렉트 방지).
 * `/`로 시작하지 않거나, `//`·`/\`처럼 다른 호스트로 해석되는 값, 절대 주소는 `fallback`을 돌려준다.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(value, SAME_SITE_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== SAME_SITE_BASE) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/login?next=...`. next가 첫 화면이거나 같은 사이트 경로가 아니면 붙이지 않는다. */
export function loginPath(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(safe)}`;
}
