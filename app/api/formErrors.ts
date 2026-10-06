import { useTranslation } from "react-i18next";

import { errorMessage, fieldErrorMessages } from "./errorMessage";
import { isApiError } from "./errors";
import type { ApiFieldError } from "./types";

/**
 * 폼 action이 화면에 돌려주는 오류(직렬화 가능). 문구는 화면에서 화면 언어로 만든다(FR-154).
 * - `resultCode`: backend 오류 코드(또는 front가 미리 검사한 VALIDATION_FAILED)
 * - `field`: 특정 입력란의 문제인 오류 코드(EMAIL_TAKEN → email 등)면 그 입력란 이름
 * - `fieldErrors`: 입력란별 검증 오류(fieldErrors.{code})
 */
export interface FormErrorData {
  resultCode: string;
  field: string | null;
  fieldErrors: ApiFieldError[];
}

export const VALIDATION_FAILED = "VALIDATION_FAILED";

/** backend 오류를 폼 오류로 바꾼다. ApiError가 아니면 그대로 던진다. */
export function toFormError(
  error: unknown,
  fieldByCode: Record<string, string> = {},
): { data: FormErrorData; status: number } {
  if (!isApiError(error)) {
    throw error;
  }
  return {
    data: {
      resultCode: error.resultCode,
      field: fieldByCode[error.resultCode] ?? null,
      fieldErrors: error.fieldErrors,
    },
    status: error.status,
  };
}

/** front가 미리 찾은 빈 필수 입력 */
export function requiredErrors(values: Record<string, unknown>): ApiFieldError[] {
  return Object.entries(values)
    .filter(([, value]) => value === "" || value === false || value === null || value === undefined)
    .map(([field]) => ({ field, code: "REQUIRED" }));
}

export interface FormMessages {
  /** 폼 위에 보여줄 문구(입력란에 붙지 않는 오류, 또는 입력 검증 실패 안내) */
  form: string | null;
  /** 입력란 이름 → 문구 */
  fields: Record<string, string>;
}

export function useFormMessages(error: FormErrorData | null | undefined): FormMessages {
  const { t } = useTranslation();
  if (!error) {
    return { form: null, fields: {} };
  }
  const fields = fieldErrorMessages(t, error.fieldErrors);
  if (error.field) {
    fields[error.field] = errorMessage(t, error.resultCode);
    return { form: null, fields };
  }
  return { form: errorMessage(t, error.resultCode), fields };
}
