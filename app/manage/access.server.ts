import { data } from "react-router";

import { apiErrorResponse, isApiError } from "~/api/errors";
import { requireUser, type SessionUser } from "~/auth/session.server";

/** 볼 수 없는 화면은 존재를 드러내지 않고 HTTP 404로 응답한다(contracts/routes.md). */
export const manageNotFound = () => data(null, { status: 404 });

/**
 * 블로그 관리(`/:handle/manage/**`)의 loader·action 첫 줄. 비로그인은 `/login?next=...`,
 * 내 블로그(삭제하지 않은 것, /me의 `blogs`)가 아니면 404다. /me는 요청당 한 번만 부른다.
 */
export async function requireOwnedBlog(
  request: Request,
  handle: string | undefined,
): Promise<{ user: SessionUser; handle: string }> {
  const user = await requireUser(request);
  if (!handle || !user.blogs.some((blog) => blog.handle === handle)) {
    throw manageNotFound();
  }
  return { user, handle };
}

/** backend가 주인 아님(403)이라고 해도 404로 보여준다. 그 밖의 오류는 backend 상태 코드 그대로. */
export function throwManageError(error: unknown): never {
  if (isApiError(error)) {
    throw error.status === 403 ? manageNotFound() : apiErrorResponse(error);
  }
  throw error;
}
