// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Reports, { loader, meta, reportsHref } from "~/routes/admin/reports";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { group, preview } from "../support/moderation";
import { renderRoutes } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
const LIST = "GET /api/v1/admin/reports";
const call = (path: string) => loader(routeArgs<LoaderArgs>(getRequest(path, loggedIn)));

/** 신고 관리 목록(005 T045) */
describe("admin reports loader", () => {
  it("상태(기본 대기)·대상 종류·페이지(0부터)로 묶음 목록", async () => {
    const backend = mockBackend({ [ME]: ok(member()), [LIST]: ok([group()], { totalCount: 21 }) });

    await expect(call("/admin/reports")).resolves.toEqual({
      status: "PENDING",
      targetType: null,
      page: 1,
      groups: [group()],
      totalCount: 21,
    });
    expect(Object.fromEntries(backend.callsTo(LIST)[0].url.searchParams)).toEqual({
      status: "PENDING",
      page: "0",
      size: "20",
    });

    await call("/admin/reports?status=DISMISSED&targetType=COMMENT&page=2");
    expect(Object.fromEntries(backend.callsTo(LIST)[1].url.searchParams)).toEqual({
      status: "DISMISSED",
      targetType: "COMMENT",
      page: "1",
      size: "20",
    });
    await call("/admin/reports?status=NOPE&targetType=USER");
    expect(Object.fromEntries(backend.callsTo(LIST)[2].url.searchParams)).toMatchObject({
      status: "PENDING",
    });
    expect(backend.callsTo(LIST)[2].url.searchParams.has("targetType")).toBe(false);
  });

  it("관리자가 아니면(세션 role·backend NOT_FOUND) 404", async () => {
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call("/admin/reports")))).toBe(404);
    mockBackend({ [ME]: ok(member()), [LIST]: fail(404, "NOT_FOUND") });
    expect(statusOf(await caught(call("/admin/reports")))).toBe(404);
  });

  it("주소 만들기와 meta(noindex)", () => {
    expect(reportsHref("PENDING", null)).toBe("/admin/reports");
    expect(reportsHref("ACTIONED", "POST", 3)).toBe(
      "/admin/reports?status=ACTIONED&targetType=POST&page=3",
    );
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });
});

describe("admin reports 화면", () => {
  function renderReports(groups = [group()], entry = "/admin/reports") {
    mockBackend({ [ME]: ok(member()), [LIST]: ok(groups, { totalCount: groups.length }) });
    renderRoutes([{ path: "admin/reports", loader: stub(loader), Component: Reports }], {
      initialEntries: [entry],
    });
  }

  it("상태 탭(현재 표시)·종류 거르기·묶음 표(미리보기·신고 수 링크·사유별 수·첫 접수)", async () => {
    renderReports([
      group(),
      group({
        representativeId: 12,
        targetType: null,
        targetId: null,
        channel: "RIGHTS_REQUEST",
        reportCount: 1,
        reasons: [{ reason: "COPYRIGHT", count: 1 }],
        target: null,
      }),
      group({
        representativeId: 13,
        channel: "MIXED",
        target: preview({ type: "COMMENT", title: null, text: "가".repeat(100), state: "HIDDEN" }),
      }),
    ]);

    const tabs = await screen.findByRole("navigation", { name: "처리 상태" });
    expect(within(tabs).getByRole("link", { name: "대기" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: "기각" })).toHaveAttribute(
      "href",
      "/admin/reports?status=DISMISSED",
    );
    expect(screen.getByRole("combobox", { name: "대상 종류" })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "신고 목록" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[0]).getByText("광고 글")).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "신고 3건" })).toHaveAttribute(
      "href",
      "/admin/reports/11",
    );
    expect(rows[0]).toHaveTextContent("스팸·광고 2");
    expect(rows[0]).toHaveTextContent("욕설·괴롭힘 1");
    expect(rows[0]).toHaveTextContent("첫 접수 2026년 10월 5일");
    expect(rows[1]).toHaveTextContent("권리 침해");
    expect(rows[1]).toHaveTextContent("대상 미정");
    expect(rows[2]).toHaveTextContent("회원 신고·권리 침해");
    expect(rows[2]).toHaveTextContent("숨김");
    expect(rows[2]).toHaveTextContent("…");
  });

  it("조치된 묶음은 결과, 없으면 안내", async () => {
    renderReports(
      [group({ status: "ACTIONED", action: "SUSPEND_USER" })],
      "/admin/reports?status=ACTIONED",
    );
    expect(await screen.findByText(/조치 · 작성자 정지/)).toBeInTheDocument();
  });

  it("신고가 없으면 안내", async () => {
    renderReports([]);
    expect(await screen.findByText("신고가 없습니다.")).toBeInTheDocument();
  });
});
