import { useId } from "react";
import { useTranslation } from "react-i18next";

/** 한 번에 보낼 수 있는 주소 수(backend `TrackbackSendService.MAX_TARGETS`) */
export const TRACKBACK_TARGETS_MAX = 10;

/** 입력란 값 → 보낼 주소(줄마다 하나, 앞뒤 공백·빈 줄 제거, 같은 주소는 하나로) */
export function parseTrackbackTargets(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    ),
  ];
}

export interface TrackbackTargetsFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** 공개 글이 아니면 보낼 수 없다(005 FR-052) */
  enabled: boolean;
  error?: string | null;
  disabled?: boolean;
}

/** 발행 설정의 "트랙백 보내기"(005 FR-052): 받을 글의 트랙백 주소를 한 줄에 하나씩, 최대 10개 */
export function TrackbackTargetsField({
  value,
  onChange,
  enabled,
  error,
  disabled = false,
}: TrackbackTargetsFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="form-field trackback-targets">
      <label htmlFor={id}>{t("trackback:send.label")}</label>
      <textarea
        id={id}
        name="trackbackUrls"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || !enabled}
        placeholder="https://"
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
      />
      <p id={hintId} className="form-hint">
        {enabled
          ? t("trackback:send.hint", { max: TRACKBACK_TARGETS_MAX })
          : t("trackback:send.publicOnly")}
      </p>
      {error && (
        <p id={errorId} className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
