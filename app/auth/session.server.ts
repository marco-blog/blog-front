import { redirect } from "react-router";

import { backendSession } from "~/api/backendCookies.server";
import { createApiClient, type ApiClientOptions } from "~/api/client.server";
import { isApiError } from "~/api/errors";

import { loginPath } from "./paths";

export { LOGIN_PATH, loginPath, safeNextPath } from "./paths";

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
  if (options) {
    return fetchSessionUser(request, options);
  }
  // root loader와 화면 loader가 같은 요청에서 함께 불러도 /me는 한 번만 부른다.
  const { memo } = backendSession(request);
  let pending = memo.get(ME_MEMO_KEY) as Promise<SessionUser | null> | undefined;
  if (!pending) {
    pending = fetchSessionUser(request);
    memo.set(ME_MEMO_KEY, pending);
  }
  return pending;
}

const ME_MEMO_KEY = "GET /me";

async function fetchSessionUser(
  request: Request,
  options?: ApiClientOptions,
): Promise<SessionUser | null> {
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
