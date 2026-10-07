// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ManageDashboard } from "~/api/models";
import Dashboard, { loader } from "~/routes/manage/dashboard";

import { mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { withCookie } from "../support/route";

const ME = "GET /api/v1/me";
const DASHBOARD = "GET /api/v1/blogs/marco/manage/dashboard";
const me = {
  userId: 1,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
  unseenReleaseNote: null,
};

const base: ManageDashboard = {
  draftCount: 0,
  recentPosts: [],
  newComments7d: 0,
  recentComments: [],
};

function renderDashboard(dashboard: ManageDashboard) {
  mockBackend({ [ME]: ok(me), [DASHBOARD]: ok(dashboard) });
  renderRoutes(
    [
      {
        path: ":handle/manage",
        loader: withCookie(loader as never) as never,
        Component: Dashboard,
      },
    ],
    { initialEntries: ["/marco/manage"] },
  );
}

describe("대시보드 방명록(004)", () => {
  it("최근 7일 새 방명록 수(방명록 관리 링크)와 최근 5건(비회원·비밀 표시)", async () => {
    renderDashboard({
      ...base,
      newGuestbook7d: 3,
      recentGuestbook: [
        {
          id: 9,
          content: "놀러 왔어요",
          secret: true,
          deleted: false,
          author: { userId: null, nickname: "지나가던 사람", profileImageUrl: null, guest: true },
          createdAt: "2026-10-06T04:24:19Z",
          updatedAt: "2026-10-06T04:24:19Z",
          replies: [],
        },
      ],
    });

    expect(await screen.findByRole("link", { name: "3개" })).toHaveAttribute(
      "href",
      "/marco/manage/guestbook",
    );
    const section = screen.getByRole("region", { name: "최근 방명록" });
    expect(section).toHaveTextContent("놀러 왔어요");
    expect(section).toHaveTextContent("지나가던 사람 (비회원) · 비밀글");
    expect(within(section).getByRole("link", { name: "방명록 모두 보기" })).toBeInTheDocument();
  });

  it("방명록이 없으면 안내", async () => {
    renderDashboard({ ...base, newGuestbook7d: 0, recentGuestbook: [] });
    expect(await screen.findByText("아직 방명록 글이 없습니다.")).toBeInTheDocument();
  });

  it("004 필드가 없는 응답이면 방명록 영역을 숨긴다", async () => {
    renderDashboard(base);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("region", { name: "최근 방명록" })).toBeNull();
  });
});
