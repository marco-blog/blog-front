// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminDashboard } from "~/api/models";
import Dashboard, { loader, meta } from "~/routes/admin/dashboard";

import { ME, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";

const DASHBOARD = "GET /api/v1/admin/dashboard";

const dashboard = (overrides: Partial<AdminDashboard> = {}): AdminDashboard => ({
  today: { signups: 3, publishedPosts: 12, comments: 1500 },
  totals: { members: 1024, blogs: 900, publicPosts: 4321 },
  pendingReports: 7,
  trend: [
    { date: "2026-10-01", signups: 1, publishedPosts: 4 },
    { date: "2026-10-02", signups: 0, publishedPosts: 0 },
    { date: "2026-10-03", signups: 2, publishedPosts: 8 },
    { date: "2026-10-04", signups: 0, publishedPosts: 1 },
    { date: "2026-10-05", signups: 0, publishedPosts: 2 },
    { date: "2026-10-06", signups: 1, publishedPosts: 3 },
    { date: "2026-10-07", signups: 3, publishedPosts: 12 },
  ],
  timeZone: "Asia/Seoul",
  generatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  ...overrides,
});

function renderDashboard(value: AdminDashboard, language: "ko" | "en" = "ko") {
  mockBackend({ [ME]: ok(member()), [DASHBOARD]: ok(value) });
  renderRoutes([{ path: "admin", loader: stub(loader), Component: Dashboard }], {
    initialEntries: ["/admin"],
    language,
  });
}

/** 콘솔 대시보드(006 FR-103, T026) */
describe("admin dashboard", () => {
  it("오늘·전체 카드 6개와 처리 대기 신고(→ /admin/reports)", async () => {
    renderDashboard(dashboard());

    expect(await screen.findByRole("heading", { name: "대시보드", level: 1 })).toBeInTheDocument();
    const today = screen.getByRole("region", { name: "오늘" });
    expect(
      within(today)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["가입3", "발행 글12", "댓글1,500"]);
    const totals = screen.getByRole("region", { name: "전체" });
    expect(
      within(totals)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["회원1,024", "블로그900", "공개 글4,321", "처리 대기 신고7"]);
    expect(within(totals).getByRole("link", { name: "처리 대기 신고" })).toHaveAttribute(
      "href",
      "/admin/reports",
    );
  });

  it("pendingReports가 null이면 신고 카드가 없다", async () => {
    renderDashboard(dashboard({ pendingReports: null }));

    const totals = await screen.findByRole("region", { name: "전체" });
    expect(within(totals).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("link", { name: "처리 대기 신고" })).toBeNull();
  });

  it("최근 7일 막대 표(가입·발행 두 계열), n분 전 기준과 시간대", async () => {
    renderDashboard(dashboard());

    const table = await screen.findByRole("table", { name: "최근 7일 가입·발행" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["날짜", "가입", "발행"]);
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    expect(screen.getByText("3분 전 기준")).toBeInTheDocument();
    expect(screen.getByText(/날짜는 Asia\/Seoul 기준입니다/)).toBeInTheDocument();
  });

  it("영어 화면 문구", async () => {
    renderDashboard(dashboard(), "en");

    expect(await screen.findByRole("region", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Sign-ups and published posts, last 7 days")).toBeInTheDocument();
  });

  it("backend 404 NOT_FOUND면 404, meta noindex", async () => {
    mockBackend({ [ME]: ok(member()), [DASHBOARD]: fail(404, "NOT_FOUND") });
    renderRoutes(
      [
        {
          path: "admin",
          loader: stub(loader),
          Component: Dashboard,
          ErrorBoundary: () => <p>404 화면</p>,
        },
      ],
      { initialEntries: ["/admin"] },
    );
    expect(await screen.findByText("404 화면")).toBeInTheDocument();
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });
});
