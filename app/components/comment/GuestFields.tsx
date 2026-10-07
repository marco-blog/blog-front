import { useTranslation } from "react-i18next";

import { GUEST_NAME_MAX, GUEST_PASSWORD_MAX, GUEST_PASSWORD_MIN } from "~/api/models";
import { FormField } from "~/components/form/FormField";

export interface GuestFieldsProps {
  /** 입력란 이름 → 오류 문구(`guestName`, `guestPassword`) */
  errors?: Record<string, string>;
  disabled?: boolean;
}

/**
 * 비회원 댓글·방명록의 이름·비밀번호 칸(004 FR-066). 비로그인 방문자에게, 블로그가 비회원 쓰기를 허용할 때만 보인다.
 * 비밀번호는 나중에 고치거나 지울 때 다시 입력한다.
 */
export function GuestFields({ errors = {}, disabled = false }: GuestFieldsProps) {
  const { t } = useTranslation();
  return (
    <fieldset className="guest-fields">
      <legend>{t("guestbook:guest.legend")}</legend>
      <FormField
        label={t("guestbook:guest.name")}
        name="guestName"
        required
        maxLength={GUEST_NAME_MAX}
        autoComplete="nickname"
        error={errors.guestName}
        disabled={disabled}
      />
      <FormField
        label={t("guestbook:guest.password")}
        name="guestPassword"
        type="password"
        required
        minLength={GUEST_PASSWORD_MIN}
        maxLength={GUEST_PASSWORD_MAX}
        autoComplete="new-password"
        hint={t("guestbook:guest.passwordHint", {
          min: GUEST_PASSWORD_MIN,
          max: GUEST_PASSWORD_MAX,
        })}
        error={errors.guestPassword}
        disabled={disabled}
      />
    </fieldset>
  );
}
