import { useTranslation } from "react-i18next";

export interface SecretToggleProps {
  /** 체크 라벨(기본 "비밀글") */
  label?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}

/** 비밀글·비밀 댓글 체크(004 FR-057, FR-065). 폼 값 `secret=on` */
export function SecretToggle({
  label,
  defaultChecked = false,
  disabled = false,
}: SecretToggleProps) {
  const { t } = useTranslation();
  return (
    <label className="secret-toggle">
      <input type="checkbox" name="secret" defaultChecked={defaultChecked} disabled={disabled} />{" "}
      {label ?? t("guestbook:secret.label")}
    </label>
  );
}
