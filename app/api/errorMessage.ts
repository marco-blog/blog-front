import type { TFunction } from "i18next";

import type { ApiFieldError } from "./types";

/** backend 오류 코드 형식(대문자 스네이크). 이 밖의 값은 키로 쓰지 않는다. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export const UNKNOWN_ERROR_CODE = "UNKNOWN";
export const UNKNOWN_FIELD_ERROR_CODE = "INVALID";

/**
 * API 오류 코드(header.resultCode)를 화면 언어 문구로 바꾼다(FR-154, research.md R22).
 * 키는 errors 네임스페이스의 `{code}`이며, 모르는 코드는 일반 오류 문구(`UNKNOWN`)를 쓴다.
 * backend의 resultMessage는 영어 디버그용이라 화면에 쓰지 않는다. ApiError·ApiErrorData를 그대로 넘겨도 된다.
 */
export function errorMessage(
  t: TFunction,
  codeOrError: string | { resultCode: string } | null | undefined,
): string {
  const code = typeof codeOrError === "object" ? codeOrError?.resultCode : codeOrError;
  const fallback = t(`errors:${UNKNOWN_ERROR_CODE}`);
  if (!code || !CODE_PATTERN.test(code)) {
    return fallback;
  }
  return t(`errors:${code}`, { defaultValue: fallback });
}

/**
 * 입력 검증 오류(header.fieldErrors[].code)를 문구로 바꾼다. 키는 errors 네임스페이스의 `fieldErrors.{code}`,
 * params(max, min, value)는 문구의 {{max}} 등에 들어간다. 모르는 코드는 `fieldErrors.INVALID`를 쓴다.
 */
export function fieldErrorMessage(
  t: TFunction,
  error: Pick<ApiFieldError, "code" | "params">,
): string {
  const params = error.params ?? {};
  const fallback = t(`errors:fieldErrors.${UNKNOWN_FIELD_ERROR_CODE}`, params);
  if (!CODE_PATTERN.test(error.code)) {
    return fallback;
  }
  return t(`errors:fieldErrors.${error.code}`, { ...params, defaultValue: fallback });
}

/** 필드별 첫 오류 문구. 폼에서 입력란 아래에 보여줄 때 쓴다. */
export function fieldErrorMessages(
  t: TFunction,
  errors: readonly ApiFieldError[] | null | undefined,
): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const error of errors ?? []) {
    messages[error.field] ??= fieldErrorMessage(t, error);
  }
  return messages;
}
