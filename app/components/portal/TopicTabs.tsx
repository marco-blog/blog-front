import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { TopicNode } from "~/api/models";
import { tabTopics, topicName } from "~/portal/topics";

/** 메인 주제 탭(003 FR-078, FR-147): `onTab`인 대분류, 화면 언어 이름, 대분류 페이지 링크. 없으면 그리지 않는다. */
export function TopicTabs({ topics }: { topics: TopicNode[] }) {
  const { t, i18n } = useTranslation();
  const tabs = tabTopics(topics);
  if (tabs.length === 0) {
    return null;
  }
  return (
    <nav aria-label={t("portal:home.topics")} className="portal-topic-tabs">
      <ul>
        {tabs.map((topic) => (
          <li key={topic.id}>
            <Link to={`/topics/${topic.slug}`}>{topicName(topic.names, i18n.language)}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
