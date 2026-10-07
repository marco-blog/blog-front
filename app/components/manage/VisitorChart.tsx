import { useTranslation } from "react-i18next";

import type { VisitStats } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

/**
 * 일별 방문자 표와 CSS 막대(004 FR-067, 차트 라이브러리 없음). 날짜는 서비스 기준 시간대의 날짜(`YYYY-MM-DD`) 그대로다.
 * 막대 너비는 가장 많은 날을 100%로 한다.
 */
export function VisitorChart({ daily }: { daily: VisitStats["daily"] }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const max = Math.max(1, ...daily.map((day) => day.visitors));
  return (
    <table className="visitor-chart">
      <caption>{t("manage:stats.dailyCaption", { count: daily.length })}</caption>
      <thead>
        <tr>
          <th scope="col">{t("manage:stats.date")}</th>
          <th scope="col">{t("manage:stats.visitors")}</th>
        </tr>
      </thead>
      <tbody>
        {daily.map((day) => (
          <tr key={day.date}>
            <th scope="row">
              <time dateTime={day.date}>{day.date}</time>
            </th>
            <td>
              <span
                className="visitor-bar"
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  height: "0.75rem",
                  marginRight: "0.5rem",
                  background: "currentColor",
                  width: `${Math.round((day.visitors / max) * 100)}%`,
                  maxWidth: "12rem",
                }}
              />
              {format.number(day.visitors)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
