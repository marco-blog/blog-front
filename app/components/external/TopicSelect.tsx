import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { TopicNode } from "~/api/models";
import { topicGroups, topicName } from "~/portal/topics";

export interface ExternalTopicSelectProps {
  /** `GET /topics` 트리 */
  topics: TopicNode[];
  /** 처음 고른 소분류(없으면 "주제를 고르세요") */
  defaultValue?: number | null;
  name?: string;
  label?: string;
  hint?: string;
  error?: string | null;
  /** 브라우저 필수 검사(같은 폼에 검사하지 않는 다른 버튼이 있으면 끈다. 서버가 다시 검사한다) */
  required?: boolean;
}

/**
 * 외부 블로그 기본 주제·글 주제 고르기(003 주제 트리). 소분류만 고를 수 있고 필수다. JS 없이 폼으로 보내도록 제어하지 않는 select다.
 */
export function TopicSelect({
  topics,
  defaultValue = null,
  name = "defaultTopicId",
  label,
  hint,
  error,
  required = true,
}: ExternalTopicSelectProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="topic-select">
      <label htmlFor={id}>{label ?? t("external:common.defaultTopic")}</label>
      <select
        id={id}
        name={name}
        required={required}
        aria-required="true"
        defaultValue={defaultValue === null ? "" : String(defaultValue)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      >
        <option value="" disabled>
          {t("external:common.selectTopic")}
        </option>
        {topicGroups(topics).map(({ major, minors }) => (
          <optgroup key={major.id} label={topicName(major.names, i18n.language)}>
            {minors.map((minor) => (
              <option key={minor.id} value={minor.id}>
                {topicName(minor.names, i18n.language)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {hint && <p className="field-hint">{hint}</p>}
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
