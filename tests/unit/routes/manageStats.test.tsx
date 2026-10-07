// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { VisitStats } from "~/api/models";
import Stats, { loader, meta } from "~/routes/manage/stats";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf, withCookie } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];

const ME = "GET /api/v1/me";
const STATS = "GET /api/v1/blogs/marco/manage/stats";
const loggedIn = { cookie: "access_token=a" };
const me = {
  userId: 1,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "America/New_York",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
  unseenReleaseNote: null,
};

const stats: VisitStats = {
  visitors: { today: 2, yesterday: 5, total: 1520 },
  daily: [
    { date: "2026-10-05", visitors: 5 },
    { date: "2026-10-06", visitors: 0 },
    { date: "2026-10-07", visitors: 2 },
  ],
  topPosts: [
    { id: 3, title: "인기 글", viewCount: 1200 },
    { id: 4, title: "", viewCount: 10 },
  ],
};

describe("통계", () => {
  it("loader: /manage/stats?days=30", async () => {
    const backend = mockBackend({ [ME]: ok(me), [STATS]: ok(stats) });
    await expect(
      loader(
        routeArgs<LoaderArgs>(getRequest("/marco/manage/stats", loggedIn), { handle: "marco" }),
      ),
    ).resolves.toEqual({ handle: "marco", stats });
    expect(backend.callsTo(STATS)[0].url.searchParams.get("days")).toBe("30");
  });

  it("loader: backend 403은 404", async () => {
    mockBackend({ [ME]: ok(me), [STATS]: fail(403, "FORBIDDEN") });
    expect(
      statusOf(
        await caught(
          loader(
            routeArgs<LoaderArgs>(getRequest("/marco/manage/stats", loggedIn), { handle: "marco" }),
          ),
        ),
      ),
    ).toBe(404);
  });

  it("meta는 noindex", () => {
    expect(
      meta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as unknown as MetaArgs),
    ).toEqual([{ title: "통계 - 블로그" }, { name: "robots", content: "noindex" }]);
  });

  function renderStats(value: VisitStats) {
    mockBackend({ [ME]: ok(me), [STATS]: ok(value) });
    renderRoutes(
      [
        {
          path: ":handle/manage/stats",
          loader: withCookie(loader as never) as never,
          Component: Stats,
        },
      ],
      { initialEntries: ["/marco/manage/stats"] },
    );
  }

  it("오늘·어제·전체, 일별 표와 막대, 시간대 안내, 조회수 상위", async () => {
    renderStats(stats);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("통계");
    expect(screen.getByText("오늘").nextSibling).toHaveTextContent("2");
    expect(screen.getByText("전체").nextSibling).toHaveTextContent("1,520");
    expect(screen.getByText(/서비스 기준 시간대\(한국 시간\)의 날짜/)).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "최근 3일 방문자" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      "2026-10-055",
      "2026-10-060",
      "2026-10-072",
    ]);
    const bars = table.querySelectorAll<HTMLElement>(".visitor-bar");
    expect([...bars].map((bar) => bar.style.width)).toEqual(["100%", "0%", "40%"]);

    const top = screen.getByRole("region", { name: "조회수가 많은 글" });
    expect(within(top).getByRole("link", { name: "인기 글" })).toHaveAttribute("href", "/marco/3");
    expect(top).toHaveTextContent("(제목 없음)");
  });

  it("글이 없으면 안내", async () => {
    renderStats({ ...stats, topPosts: [] });
    expect(await screen.findByText("아직 글이 없습니다.")).toBeInTheDocument();
  });
});
