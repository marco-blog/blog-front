import { CLIENT_ERROR_CODES } from "./errors";
import { UNKNOWN_ERROR_CODE, UNKNOWN_FIELD_ERROR_CODE } from "./errorMessage";

/**
 * 화면 문구가 있어야 하는 오류 코드 목록(FR-154, SC-024). 문구는 4개 언어 `errors.json`의 `{code}` 키다.
 * - backend `resultCode`: contracts/api.md "오류 코드" 표의 001 코드 + 공통 처리 코드(backend `ErrorCode`).
 *   003·006 전용 코드(RELEASE_NOTE_*)는 해당 스펙을 구현할 때 더한다(tasks.md "구현 전 결정 사항" 8번).
 * - front가 정하는 코드(BACKEND_UNAVAILABLE 등)와 모르는 코드용 UNKNOWN
 * 새 코드를 쓰면 여기와 4개 언어 errors.json에 같은 PR에서 넣는다(tests/unit/i18n/errorCodes.test.ts).
 */
export const API_ERROR_CODES = [
  // 400
  "VALIDATION_FAILED",
  "THUMBNAIL_SIZE_NOT_ALLOWED",
  "PASSWORD_RESET_TOKEN_INVALID",
  "CURRENT_PASSWORD_MISMATCH",
  // 401
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "REFRESH_INVALID",
  // 403
  "FORBIDDEN",
  "ORIGIN_NOT_ALLOWED",
  // 404
  "BLOG_NOT_FOUND",
  "POST_NOT_FOUND",
  "DRAFT_NOT_FOUND",
  "CATEGORY_NOT_FOUND",
  "COMMENT_NOT_FOUND",
  "MEDIA_NOT_FOUND",
  "NOT_FOUND",
  // 409
  "EMAIL_TAKEN",
  "HANDLE_TAKEN",
  "CATEGORY_NAME_TAKEN",
  "BLOG_LIMIT_EXCEEDED",
  "LAST_BLOG_CANNOT_BE_DELETED",
  "POST_NOT_PUBLISHED",
  // 413, 415
  "MEDIA_TOO_LARGE",
  "MEDIA_TYPE_NOT_ALLOWED",
  // 422
  "HANDLE_RESERVED",
  "HANDLE_INVALID",
  "TAG_LIMIT_EXCEEDED",
  "CATEGORY_DEPTH_EXCEEDED",
  "REPLY_DEPTH_EXCEEDED",
  "COMMENTS_DISABLED",
  "POST_NOT_IN_TRASH",
  "POST_CONTENT_EMPTY",
  "TERMS_VERSION_OUTDATED",
  // 423, 429
  "ACCOUNT_LOCKED",
  "MEDIA_TEMP_QUOTA_EXCEEDED",
  // 공통 처리(표에 없는 HTTP 오류): 405, 415(요청 형식), 429(요청 제한), 500
  "METHOD_NOT_ALLOWED",
  "UNSUPPORTED_MEDIA_TYPE",
  "TOO_MANY_REQUESTS",
  "INTERNAL_ERROR",
] as const;

/** 화면 문구가 있어야 하는 전체 오류 코드(backend + front + 모르는 코드) */
export const ERROR_CODES = [
  ...API_ERROR_CODES,
  ...Object.values(CLIENT_ERROR_CODES),
  UNKNOWN_ERROR_CODE,
] as const;

/** 입력 검증 오류 코드(`header.fieldErrors[].code`). 문구는 `errors.json`의 `fieldErrors.{code}` 키다. */
export const FIELD_ERROR_CODES = [
  "REQUIRED",
  "TOO_LONG",
  "TOO_SHORT",
  "TOO_LARGE",
  "TOO_SMALL",
  "INVALID_FORMAT",
  "PASSWORD_WEAK",
  "PASSWORD_CONFIRM_MISMATCH",
  UNKNOWN_FIELD_ERROR_CODE,
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
