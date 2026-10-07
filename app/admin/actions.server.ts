import { data } from "react-router";

import { VALIDATION_FAILED, toFormError, type FormErrorData } from "~/api/formErrors";
import type { ApiFieldError } from "~/api/types";

import { adminNotFound, isAdminDenied } from "./access.server";

/** 콘솔 화면 action의 결과. 성공이면 `intent`와 화면에 넘길 값, 실패면 폼 오류. `key`는 설정 화면의 대상 키 */
export type AdminActionData<Extra = object> =
  | ({ intent: string; ok: true; key?: string } & Extra)
  | (FormErrorData & { intent: string; ok: false; key?: string });

/**
 * backend 오류를 폼 오류로. 관리자 아님(권한 회수)은 404 화면으로 던진다.
 * `renameField`로 backend 입력란 이름을 화면 입력란 이름으로 바꿀 수 있다.
 */
export function adminActionError(
  intent: string,
  error: unknown,
  options: { key?: string; renameField?: (field: string) => string } = {},
) {
  if (isAdminDenied(error)) {
    throw adminNotFound();
  }
  const { data: formError, status } = toFormError(error);
  const rename = options.renameField ?? ((field: string) => field);
  return data<AdminActionData>(
    {
      ...formError,
      fieldErrors: formError.fieldErrors.map((item) => ({ ...item, field: rename(item.field) })),
      intent,
      ok: false,
      ...(options.key ? { key: options.key } : {}),
    },
    { status },
  );
}

/** front가 미리 찾은 입력 오류(400) */
export function adminInvalid(intent: string, fieldErrors: ApiFieldError[] = [], key?: string) {
  return data<AdminActionData>(
    {
      intent,
      ok: false,
      resultCode: VALIDATION_FAILED,
      field: null,
      fieldErrors,
      ...(key ? { key } : {}),
    },
    { status: 400 },
  );
}
