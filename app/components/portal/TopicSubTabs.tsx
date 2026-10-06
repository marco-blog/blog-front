import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { TopicNode } from "~/api/models";
import { topicName } from "~/portal/topics";

export interface TopicSubTabsProps {
  major: TopicNode;
  /** 지금 소분류(대분류 페이지면 null) */
  current: TopicNode | null;
}

/**
 * 주제 페이지의 소분류 목록(003 FR-078, FR-147): "전체"(대분류 페이지)와 탭에 보이는(`onTab`) 소분류. 지금 소분류는
 * 자동 숨김이어도 보인다. 지금 항목은 `aria-current`.
 */
export function TopicSubTabs({ major, current }: TopicSubTabsProps) {
  const { t, i18n } = useTranslation();
  const minors = major.children.filter((minor) => minor.onTab || minor.id === current?.id);
  return (
    <nav aria-label={t("portal:topic.subtopics")} className="portal-subtopics">
      <ul>
        <li>
          <Link to={`/topics/${major.slug}`} aria-current={current === null ? "page" : undefined}>
            {t("portal:topic.all")}
          </Link>
        </li>
        {minors.map((minor) => (
          <li key={minor.id}>
            <Link
              to={`/topics/${major.slug}/${minor.slug}`}
              aria-current={minor.id === current?.id ? "page" : undefined}
            >
              {topicName(minor.names, i18n.language)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
