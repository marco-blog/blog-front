import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import {
  EXTERNAL_TOPIC_SOURCES,
  type ClassificationStats as Stats,
  type TopicNode,
} from "~/api/models";
import { topicLabel } from "~/external/topics";
import { useDateFormat } from "~/i18n/format";

/** 비율(0~1)을 소수 한 자리 퍼센트 문자열로. 표본이 없으면(null) null */
export function percent(rate: number | null): string | null {
  return rate === null ? null : (Math.round(rate * 1000) / 10).toFixed(1);
}

const BAR_WIDTH = 240;
const BAR_HEIGHT = 14;
/** 출처별 막대 색(표의 같은 열 순서) */
const SOURCE_FILL: Record<string, string> = {
  OWNER: "#2f6fdd",
  REVIEW: "#16a34a",
  RULE: "#d97706",
  AUTO: "#7c3aed",
  DEFAULT: "#9ca3af",
};

/**
 * 분류 현황(007 T071, FR-122): 최근 30일 자동 분류 정확도·최종 주제 정확도(표본, 정의, 표본 0이면 "—"), 주제별 분포(출처별 막대, 인라인 SVG
 * 와 같은 수치의 표), 검수 대기 수, 지금 신뢰도 기준·분류 방식.
 */
export function ClassificationStats({ stats, topics }: { stats: Stats; topics: TopicNode[] }) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const max = Math.max(1, ...stats.distribution.map((row) => row.total));
  const cards = [
    {
      key: "classifier",
      title: t("external:admin.stats.classifierAccuracy"),
      hint: t("external:admin.stats.classifierHint"),
      sample: stats.classifierAccuracy.sample,
      rate: percent(stats.classifierAccuracy.rate),
    },
    {
      key: "final",
      title: t("external:admin.stats.finalAccuracy"),
      hint: t("external:admin.stats.finalHint"),
      sample: stats.finalAccuracy.sample,
      rate: percent(stats.finalAccuracy.rate),
    },
  ];
  return (
    <>
      <p>
        {t("external:admin.stats.window", {
          from: format.date(stats.window.from),
          to: format.date(stats.window.to),
        })}
      </p>
      <div className="stats-cards">
        {cards.map((card) => (
          <section key={card.key} className="stats-card" aria-label={card.title}>
            <h2>{card.title}</h2>
            <p className="stats-value" data-testid={`stats-${card.key}`}>
              {card.rate === null ? "—" : t("external:admin.stats.rate", { rate: card.rate })}
            </p>
            <p>
              {card.sample === 0
                ? t("external:admin.stats.noData")
                : t("external:admin.stats.sample", { count: card.sample })}
            </p>
            <p className="field-hint">{card.hint}</p>
          </section>
        ))}
      </div>
      <p>
        {t("external:admin.stats.pendingReviews", { count: stats.pendingReviews })}{" "}
        <Link to="/admin/external-blogs/reviews">{t("external:admin.stats.goReviews")}</Link>
      </p>
      <dl className="external-blog-info">
        <dt>{t("external:admin.stats.minConfidence")}</dt>
        <dd>{format.number(stats.minConfidence)}</dd>
        <dt>{t("external:admin.stats.classifierVersion")}</dt>
        <dd>
          <code>{stats.classifierVersion}</code>
        </dd>
        <dt>{t("external:admin.stats.generatedAt")}</dt>
        <dd>{format.dateTime(stats.generatedAt)}</dd>
      </dl>
      <section aria-label={t("external:admin.stats.distribution")}>
        <h2>{t("external:admin.stats.distribution")}</h2>
        {stats.distribution.length === 0 ? (
          <p>{t("external:admin.stats.noData")}</p>
        ) : (
          <div className="table-scroll">
            <table className="admin-table" aria-label={t("external:admin.stats.chart")}>
              <thead>
                <tr>
                  <th>{t("external:common.topic")}</th>
                  <th>{t("external:admin.stats.total")}</th>
                  {EXTERNAL_TOPIC_SOURCES.map((source) => (
                    <th key={source}>{t(`external:topicSource.${source}`)}</th>
                  ))}
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {stats.distribution.map((row) => {
                  let x = 0;
                  return (
                    <tr key={row.topicId}>
                      <td>{topicLabel(topics, row.topicId, i18n.language)}</td>
                      <td>{format.number(row.total)}</td>
                      {EXTERNAL_TOPIC_SOURCES.map((source) => (
                        <td key={source}>{format.number(row.bySource[source] ?? 0)}</td>
                      ))}
                      <td aria-hidden="true">
                        <svg
                          width={BAR_WIDTH}
                          height={BAR_HEIGHT}
                          viewBox={`0 0 ${BAR_WIDTH} ${BAR_HEIGHT}`}
                          className="stats-bar"
                        >
                          {EXTERNAL_TOPIC_SOURCES.map((source) => {
                            const width = ((row.bySource[source] ?? 0) / max) * BAR_WIDTH;
                            const rect = (
                              <rect
                                key={source}
                                x={x}
                                y={0}
                                width={width}
                                height={BAR_HEIGHT}
                                fill={SOURCE_FILL[source]}
                                className={`stats-bar-${source.toLowerCase()}`}
                              />
                            );
                            x += width;
                            return rect;
                          })}
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
