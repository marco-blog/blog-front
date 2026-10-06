import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { TopicNode } from "~/api/models";
import { findTopicById, topicGroups, topicName } from "~/portal/topics";

export interface TopicSelectProps {
  /** `GET /topics` 트리(운영자 숨김 주제는 오지 않는다) */
  topics: TopicNode[];
  value: number | null;
  onChange: (topicId: number | null) => void;
  label?: string;
  /** 폼으로 보낼 때의 이름 */
  name?: string;
  disabled?: boolean;
}

/**
 * 주제 고르기(003 FR-076). 대분류별로 묶은 소분류만 고를 수 있고(화면 언어 이름), 첫 항목은 "선택 안 함"(null).
 * 지금 값이 목록에 없으면(나중에 운영자가 숨긴 주제) "현재 주제(숨김)"으로 남겨 두어 다시 발행해도 바뀌지 않게 한다.
 */
export function TopicSelect({
  topics,
  value,
  onChange,
  label,
  name,
  disabled = false,
}: TopicSelectProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const known = findTopicById(topics, value);
  const hiddenCurrent = value !== null && (!known || known.parent === null);
  return (
    <div className="topic-select">
      <label htmlFor={id}>{label ?? t("post:topic.label")}</label>
      <select
        id={id}
        name={name}
        disabled={disabled}
        value={value === null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">{t("post:topic.none")}</option>
        {hiddenCurrent && <option value={String(value)}>{t("post:topic.hiddenCurrent")}</option>}
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
      <p className="field-hint">{t("post:topic.hint")}</p>
    </div>
  );
}
