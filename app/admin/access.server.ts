import { data } from "react-router";

import { apiErrorResponse, isApiError } from "~/api/errors";
import { requireUser, type SessionUser } from "~/auth/session.server";

import { ADMIN_ROLES, isAdmin } from "./roles";

export { ADMIN_ROLES };

/** 콘솔은 관리자가 아니면 존재를 드러내지 않고 HTTP 404로 응답한다(003 contracts/routes.md). */
export const adminNotFound = () => data(null, { status: 404 });

/**
 * 관리자 콘솔(`/admin/**`)의 loader·action 첫 줄. 비로그인은 `/login?next=...`, 세션 `role`이 관리자가 아니면 404.
 * 권한이 회수된 회원은 세션 role이 남아 있어도 backend가 404 `NOT_FOUND`를 주므로 {@link throwAdminError}가 404로 바꾼다.
 */
export async function requireAdmin(request: Request): Promise<SessionUser> {
  const user = await requireUser(request);
  if (!isAdmin(user.role)) {
    throw adminNotFound();
  }
  return user;
}

/** backend가 관리자 아님(404 `NOT_FOUND`, 403)이라고 하면 콘솔 404로. 그 밖의 오류는 backend 상태 코드 그대로. */
export function isAdminDenied(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.status === 403 || (error.status === 404 && error.resultCode === "NOT_FOUND"))
  );
}

/** loader용: 관리자 아님은 404, 그 밖의 API 오류는 같은 상태 코드의 오류 화면 */
export function throwAdminError(error: unknown): never {
  if (isAdminDenied(error)) {
    throw adminNotFound();
  }
  if (isApiError(error)) {
    throw apiErrorResponse(error);
  }
  throw error;
}
