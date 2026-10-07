import { data } from "react-router";

import { ApiError, isApiError } from "~/api/errors";
import { VALIDATION_FAILED, toFormError } from "~/api/formErrors";

import type { ExternalFormError } from "./status";

/** 외부 블로그 화면 action의 실패 결과(`intent`와 오류, backend `params` 포함). ApiError가 아니면 그대로 던진다. */
export function externalActionError<Extra extends object = object>(
  intent: string,
  error: unknown,
  extra?: Extra,
) {
  const { data: formError, status } = toFormError(error);
  const params =
    isApiError(error) && Object.keys(error.params).length > 0 ? error.params : undefined;
  return data<{ intent: string; ok: false; error: ExternalFormError } & Partial<Extra>>(
    {
      intent,
      ok: false,
      error: { ...formError, ...(params ? { params } : {}) },
      ...(extra ?? ({} as Extra)),
    },
    { status },
  );
}

/** 폼 값(앞뒤 공백 제거). 없으면 빈 문자열 */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** 양의 정수 폼 값. 아니면 null */
export function formId(form: FormData, name: string): number | null {
  const text = formText(form, name);
  if (!/^\d{1,18}$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** front가 미리 찾은 입력 오류(400, backend 오류와 같은 모양) */
export function invalidField(field: string, code = "INVALID"): ApiError {
  return new ApiError({
    status: 400,
    resultCode: VALIDATION_FAILED,
    fieldErrors: [{ field, code }],
  });
}
