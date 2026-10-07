// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DailyBarChart } from "~/components/charts/DailyBarChart";

import { renderRoutes } from "../support/render";

/** 날짜·숫자 표기는 root loader의 언어·시간대를 읽으므로 라우트 안에 그린다. */
async function renderChart(node: React.ReactNode) {
  const result = renderRoutes([{ index: true, Component: () => node }]);
  await screen.findByRole("table");
  return result;
}

/** 일별 막대 표(004 VisitorChart 일반화, 006 T026) */
describe("DailyBarChart", async () => {
  it("계열 1개: 날짜·값 표와 가장 큰 날을 100%로 한 막대", async () => {
    await renderChart(
      <DailyBarChart
        caption="최근 3일"
        dateLabel="날짜"
        series={[{ key: "visitors", label: "방문자", barClassName: "visitor-bar" }]}
        rows={[
          { date: "2026-10-05", visitors: 4 },
          { date: "2026-10-06", visitors: 0 },
          { date: "2026-10-07", visitors: 1234 },
        ]}
        className="visitor-chart"
      />,
    );
    const table = screen.getByRole("table", { name: "최근 3일" });
    expect(table).toHaveClass("visitor-chart");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["날짜", "방문자"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[2]).toHaveTextContent("2026-10-071,234");
    const bars = table.querySelectorAll<HTMLElement>(".visitor-bar");
    expect([...bars].map((bar) => bar.style.width)).toEqual(["0%", "0%", "100%"]);
    expect(bars[0]).toHaveAttribute("aria-hidden", "true");
  });

  it("계열 2개: 계열마다 따로 100% 기준, 빈 목록이면 0일, 기본 클래스", async () => {
    const { container } = await renderChart(
      <DailyBarChart
        caption="최근 2일"
        dateLabel="날짜"
        series={[
          { key: "signups", label: "가입" },
          { key: "publishedPosts", label: "발행" },
        ]}
        rows={[
          { date: "2026-10-06", signups: 2, publishedPosts: 10 },
          { date: "2026-10-07", signups: 1, publishedPosts: 5 },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "최근 2일" });
    expect(table).toHaveClass("daily-bar-chart");
    expect(within(table).getAllByRole("columnheader")).toHaveLength(3);
    const bars = [...container.querySelectorAll<HTMLElement>(".daily-bar")];
    expect(bars.map((bar) => bar.style.width)).toEqual(["100%", "100%", "50%", "50%"]);
  });

  it("행이 없으면 머리글만", async () => {
    await renderChart(
      <DailyBarChart
        caption="없음"
        dateLabel="날짜"
        series={[{ key: "a", label: "A" }]}
        rows={[]}
      />,
    );
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1);
  });
});
