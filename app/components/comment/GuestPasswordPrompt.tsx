import { useId } from "react";
import { useTranslation } from "react-i18next";

import { GUEST_PASSWORD_MAX } from "~/api/models";

export interface GuestPasswordPromptProps {
  /** 라벨(기본 "작성할 때 입력한 비밀번호") */
  label?: string;
  error?: string | null;
  disabled?: boolean;
}

/** 비회원 글을 고치거나 지울 때 묻는 비밀번호 칸(004 FR-066). 폼 값 `guestPassword` */
export function GuestPasswordPrompt({ label, error, disabled = false }: GuestPasswordPromptProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="form-field guest-password">
      <label htmlFor={id}>{label ?? t("guestbook:guest.passwordPrompt")}</label>
      <input
        id={id}
        type="password"
        name="guestPassword"
        required
        maxLength={GUEST_PASSWORD_MAX}
        autoComplete="current-password"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        disabled={disabled}
      />
      {error && (
        <p id={`${id}-error`} className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
