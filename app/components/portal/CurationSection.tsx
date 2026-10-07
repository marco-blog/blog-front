import { useTranslation } from "react-i18next";

import type { PortalCard, TopicNode } from "~/api/models";

import { PortalCardList } from "./PortalCard";

export interface CardSectionProps {
  cards: PortalCard[];
  topics: TopicNode[];
  now: string;
}

/** 운영자 추천(003 FR-091). 비면 그리지 않는다. */
export function CurationSection({ cards, topics, now }: CardSectionProps) {
  const { t } = useTranslation();
  if (cards.length === 0) {
    return null;
  }
  const title = t("portal:home.curations");
  return (
    <section aria-label={title} className="portal-curations">
      <h2>{title}</h2>
      <PortalCardList cards={cards} topics={topics} now={now} label={title} />
    </section>
  );
}
