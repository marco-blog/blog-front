import { useTranslation } from "react-i18next";

import type { CardSectionProps } from "./CurationSection";
import { PortalCardList } from "./PortalCard";

/** 인기 글(003 FR-080, FR-086): 최근 7일 인기 점수 상위 12편. 비면 그리지 않는다. */
export function PopularPosts({ cards, topics, now }: CardSectionProps) {
  const { t } = useTranslation();
  if (cards.length === 0) {
    return null;
  }
  const title = t("portal:home.popular");
  return (
    <section aria-label={title} className="portal-popular">
      <h2>{title}</h2>
      <PortalCardList cards={cards} topics={topics} now={now} label={title} />
    </section>
  );
}
