import { requiredErrors } from "~/api/formErrors";
import type { ApiFieldError } from "~/api/types";

/** front가 정하는 입력 오류: 새 비밀번호와 확인 입력이 다름(문구는 errors:fieldErrors.PASSWORD_CONFIRM_MISMATCH) */
export const PASSWORD_CONFIRM_MISMATCH = "PASSWORD_CONFIRM_MISMATCH";

/**
 * 새 비밀번호 입력(비밀번호 변경·재설정) 사전 검사: 빈 입력과 확인 불일치.
 * 비밀번호 규칙(PASSWORD_WEAK)은 backend가 판단한다.
 */
export function newPasswordErrors(
  values: Record<string, string>,
  newPassword: string,
  newPasswordConfirm: string,
): ApiFieldError[] {
  const errors = requiredErrors({ ...values, newPassword, newPasswordConfirm });
  if (errors.length === 0 && newPassword !== newPasswordConfirm) {
    errors.push({ field: "newPasswordConfirm", code: PASSWORD_CONFIRM_MISMATCH });
  }
  return errors;
}
