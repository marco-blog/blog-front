import { useTranslation } from "react-i18next";

import type { ClassificationReview, TopicNode } from "~/api/models";
import { topicLabel } from "~/external/topics";
import { useDateFormat } from "~/i18n/format";

import { TopicSelect } from "./TopicSelect";

export interface ReviewTableProps {
  reviews: ClassificationReview[];
  topics: TopicNode[];
  /** 검수 대기 목록이면 줄마다 확정 주제·확정 버튼·일괄 선택 칸을 보인다 */
  pending: boolean;
}

/** 확정 주제 select의 처음 값: 예측이 있으면 예측, 없으면 지금 노출 주제 */
export function initialTopicId(review: ClassificationReview): number {
  return review.predictedTopicId ?? review.post.topicId;
}

/**
 * 분류 검수 표(007 T071). 감싸는 폼(`/admin/external-blogs/reviews`) 하나 안에 놓인다: 줄마다 `topic-{id}` select와
 * `intent=confirm:{id}` 버튼, 일괄 확정용 `selected` 체크박스. JS 없이 동작한다. 제목·요약은 외부에서 온 일반 텍스트다.
 */
export function ReviewTable({ reviews, topics, pending }: ReviewTableProps) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const topic = (id: number | null) =>
    id === null ? t("external:admin.reviews.none") : topicLabel(topics, id, i18n.language);
  return (
    <div className="table-scroll">
      <table className="admin-table review-table" aria-label={t("external:admin.reviews.title")}>
        <thead>
          <tr>
            {pending && <th>{t("external:admin.reviews.select")}</th>}
            <th>{t("external:admin.reviews.post")}</th>
            <th>{t("external:admin.reviews.blog")}</th>
            <th>{t("external:admin.reviews.predicted")}</th>
            <th>{t("external:admin.reviews.current")}</th>
            <th>
              {pending
                ? t("external:admin.reviews.confirmTo")
                : t("external:admin.reviews.confirmedTopic")}
            </th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id}>
              {pending && (
                <td>
                  <input
                    type="checkbox"
                    name="selected"
                    value={review.id}
                    aria-label={t("external:admin.reviews.selectFor", { title: review.post.title })}
                  />
                </td>
              )}
              <td>
                <a
                  href={review.post.link}
                  target="_blank"
                  rel="noopener nofollow noreferrer"
                  title={t("external:common.newTab")}
                >
                  {review.post.title}
                </a>
                {review.post.summary && <p className="field-hint">{review.post.summary}</p>}
                {review.post.feedTerms.length > 0 && (
                  <p className="field-hint">
                    {t("external:admin.reviews.feedTerms")}: {review.post.feedTerms.join(", ")}
                  </p>
                )}
              </td>
              <td>{review.externalBlog.title ?? t("external:common.untitled")}</td>
              <td>
                {topic(review.predictedTopicId)}
                {review.confidence !== null && (
                  <p className="field-hint">
                    {t("external:admin.reviews.confidence")}{" "}
                    {format.number(Math.round(review.confidence * 100) / 100)}
                  </p>
                )}
              </td>
              <td>
                {topic(review.post.topicId)} (
                {t(`external:topicSource.${review.post.topicSource}`, {
                  defaultValue: review.post.topicSource,
                })}
                )
              </td>
              <td>
                {pending ? (
                  <>
                    <TopicSelect
                      topics={topics}
                      name={`topic-${review.id}`}
                      defaultValue={initialTopicId(review)}
                      label={t("external:admin.reviews.confirmFor", { title: review.post.title })}
                    />
                    <button type="submit" name="intent" value={`confirm:${review.id}`}>
                      {t("external:admin.reviews.confirm")}
                    </button>
                  </>
                ) : (
                  <>
                    {review.status === "CONFIRMED"
                      ? topic(review.confirmedTopicId)
                      : t(`external:admin.reviewStatus.${review.status}`)}
                    {review.reviewedBy && (
                      <p className="field-hint">
                        {t("external:admin.reviews.reviewedBy")}: {review.reviewedBy.nickname}
                        {review.reviewedAt && ` · ${format.dateTime(review.reviewedAt)}`}
                      </p>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
