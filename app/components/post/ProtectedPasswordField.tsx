import { useId } from "react";
import { useTranslation } from "react-i18next";

/** 보호 글 비밀번호 길이(backend `PublishSettingsRequest.password`, 004 FR-062) */
export const POST_PASSWORD_MIN = 4;
export const POST_PASSWORD_MAX = 64;

export interface ProtectedPasswordFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** 이미 보호 글이면 비워 두면 지금 비밀번호를 그대로 쓴다 */
  keepExisting: boolean;
  error?: string | null;
  disabled?: boolean;
}

/** 발행 설정의 보호 글 비밀번호 칸(004 FR-062). 공개 범위 "보호"를 고르면 보인다. */
export function ProtectedPasswordField({
  value,
  onChange,
  keepExisting,
  error,
  disabled = false,
}: ProtectedPasswordFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="form-field protected-password">
      <label htmlFor={id}>{t("post:publish.password")}</label>
      <input
        id={id}
        type="password"
        name="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={!keepExisting}
        minLength={POST_PASSWORD_MIN}
        maxLength={POST_PASSWORD_MAX}
        autoComplete="new-password"
        aria-describedby={`${id}-hint`}
        aria-invalid={error ? true : undefined}
        disabled={disabled}
      />
      <p id={`${id}-hint`} className={error ? "form-error" : "field-hint"}>
        {error ??
          (keepExisting
            ? t("post:publish.passwordKeep")
            : t("post:publish.passwordHint", { min: POST_PASSWORD_MIN, max: POST_PASSWORD_MAX }))}
      </p>
    </div>
  );
}

/** 보낼 비밀번호의 문제(없으면 null). 이미 보호 글이고 비워 두면 문제없다. */
export function protectedPasswordError(
  password: string,
  keepExisting: boolean,
): "REQUIRED" | "TOO_SHORT" | "TOO_LONG" | null {
  if (password === "") {
    return keepExisting ? null : "REQUIRED";
  }
  if (password.length < POST_PASSWORD_MIN) {
    return "TOO_SHORT";
  }
  return password.length > POST_PASSWORD_MAX ? "TOO_LONG" : null;
}
