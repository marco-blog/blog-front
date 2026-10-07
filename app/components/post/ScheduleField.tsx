import { useId } from "react";
import { useTranslation } from "react-i18next";

export interface ScheduleFieldProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** `datetime-local` 값(회원 시간대의 벽시계 시각, `YYYY-MM-DDTHH:mm`) */
  value: string;
  onChange: (value: string) => void;
  /** 입력 기준 시간대(회원 시간대) */
  timeZone: string;
  error?: string | null;
  disabled?: boolean;
}

/**
 * 발행 설정의 예약 발행(004 FR-064). 체크하면 날짜·시각을 회원 시간대로 입력하고, 보낼 때 UTC로 바꾼다
 * (`app/i18n/zonedDateTime.ts`). 이미 발행된 글에는 보이지 않는다.
 */
export function ScheduleField({
  enabled,
  onEnabledChange,
  value,
  onChange,
  timeZone,
  error,
  disabled = false,
}: ScheduleFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <fieldset className="publish-schedule">
      <legend>{t("post:publish.publishTime")}</legend>
      <label>
        <input
          type="checkbox"
          name="schedule"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          disabled={disabled}
        />
        {t("post:publish.scheduleToggle")}
      </label>
      {enabled ? (
        <div className="form-field">
          <label htmlFor={id}>{t("post:publish.scheduledAt")}</label>
          <input
            id={id}
            type="datetime-local"
            name="scheduledAt"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required
            aria-describedby={`${id}-hint`}
            aria-invalid={error ? true : undefined}
            disabled={disabled}
          />
          <p id={`${id}-hint`} className={error ? "form-error" : "field-hint"}>
            {error ?? t("post:publish.scheduleHint", { timeZone })}
          </p>
        </div>
      ) : (
        <p>{t("post:publish.now")}</p>
      )}
    </fieldset>
  );
}
