import { useDateFormat } from "~/i18n/format";

/** 막대 계열 하나: 표의 열 제목과 각 날짜의 값 */
export interface DailySeries {
  key: string;
  label: string;
  /** 막대 요소의 클래스(시험·스타일용). 기본 `daily-bar` */
  barClassName?: string;
}

export interface DailyBarChartProps {
  caption: string;
  dateLabel: string;
  series: readonly DailySeries[];
  /** 날짜(`YYYY-MM-DD`, 이미 기준 시간대의 날짜)와 계열별 값 */
  rows: readonly ({ date: string } & Record<string, number | string>)[];
  className?: string;
}

/**
 * 일별 막대 표(차트 라이브러리 없음, 004 `VisitorChart`를 일반화 — 006 T036). 계열마다 열 하나에 CSS 막대와 숫자를 그리며,
 * 막대 너비는 그 계열에서 가장 큰 날을 100%로 한다. 표 자체가 접근성 대체(막대는 `aria-hidden`).
 */
export function DailyBarChart({
  caption,
  dateLabel,
  series,
  rows,
  className = "daily-bar-chart",
}: DailyBarChartProps) {
  const format = useDateFormat();
  const value = (row: DailyBarChartProps["rows"][number], key: string) => Number(row[key] ?? 0);
  const max = Object.fromEntries(
    series.map((entry) => [entry.key, Math.max(1, ...rows.map((row) => value(row, entry.key)))]),
  );
  return (
    <table className={className}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{dateLabel}</th>
          {series.map((entry) => (
            <th scope="col" key={entry.key}>
              {entry.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.date}>
            <th scope="row">
              <time dateTime={row.date}>{row.date}</time>
            </th>
            {series.map((entry) => (
              <td key={entry.key}>
                <span
                  className={entry.barClassName ?? "daily-bar"}
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    height: "0.75rem",
                    marginRight: "0.5rem",
                    background: "currentColor",
                    width: `${Math.round((value(row, entry.key) / max[entry.key]) * 100)}%`,
                    maxWidth: "12rem",
                  }}
                />
                {format.number(value(row, entry.key))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
