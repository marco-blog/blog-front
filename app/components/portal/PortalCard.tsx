import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { PortalCard as PortalCardData, TopicNode } from "~/api/models";
import { Avatar } from "~/components/media/Avatar";
import { useDateFormat, useRelativeTime } from "~/i18n/format";
import { thumbnailImage } from "~/media/thumbnail";
import { cardColor } from "~/portal/cardColor";
import { findTopicById, topicName } from "~/portal/topics";

export interface PortalCardProps {
  card: PortalCardData;
  /** `GET /topics` 트리(주제 이름·카드 색). 읽지 못했으면 [] */
  topics: TopicNode[];
  /** 상대 시각 기준(loader가 넘긴 서버 시각) */
  now: string;
}

/** 요약 두 줄 자르기(003 research P7). 전역 CSS가 없어 인라인으로 둔다(CSP style-src 'unsafe-inline'). */
const SUMMARY_CLAMP = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
} as const;

/**
 * 포털 글 카드(003 FR-085): 대표 이미지(없으면 주제 카드 색 기본 이미지와 주제 이름), 제목, 요약 2줄, 블로그 이름,
 * 작성자 프로필, 상대 시각, 좋아요·댓글 수. 카드 전체가 `/{handle}/{id}` 링크다.
 */
export function PortalCard({ card, topics, now }: PortalCardProps) {
  const { t, i18n } = useTranslation();
  const relative = useRelativeTime(now);
  const format = useDateFormat();
  const topic = findTopicById(topics, card.topicId);
  const name = topic ? topicName(topic.topic.names, i18n.language) : t("portal:card.noTopic");
  return (
    <article className="portal-card">
      <Link to={`/${card.blog.handle}/${card.id}`} className="portal-card-link">
        {card.thumbnailUrl ? (
          <img
            {...thumbnailImage(card.thumbnailUrl, "card")}
            alt=""
            loading="lazy"
            className="portal-card-image"
          />
        ) : (
          <div
            className="portal-card-image portal-card-placeholder"
            style={{ backgroundColor: cardColor(topics, card.topicId) }}
            data-testid="portal-card-placeholder"
          >
            <span>{name}</span>
          </div>
        )}
        <h3>{card.title}</h3>
        {card.summary && (
          <p className="portal-card-summary" style={SUMMARY_CLAMP}>
            {card.summary}
          </p>
        )}
      </Link>
      <p className="portal-card-meta">
        <Link to={`/${card.blog.handle}`}>{card.blog.title}</Link>{" "}
        <span className="portal-card-author">
          <Avatar url={card.author.profileImageUrl} /> {card.author.nickname}
        </span>{" "}
        <time dateTime={card.publishedAt} title={format.dateTime(card.publishedAt)}>
          {relative(card.publishedAt)}
        </time>{" "}
        <span>{t("portal:card.likes", { count: card.likeCount })}</span>{" "}
        <span>{t("portal:card.comments", { count: card.commentCount })}</span>
      </p>
    </article>
  );
}

export interface PortalCardListProps extends Omit<PortalCardProps, "card"> {
  cards: PortalCardData[];
  label: string;
}

/** 카드 목록(영역 공통) */
export function PortalCardList({ cards, label, topics, now }: PortalCardListProps) {
  return (
    <ul className="portal-cards" aria-label={label}>
      {cards.map((card) => (
        <li key={card.id}>
          <PortalCard card={card} topics={topics} now={now} />
        </li>
      ))}
    </ul>
  );
}
