// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Report, { action, loader, meta, operationsFor } from "~/routes/admin/report";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { preview, reportDetail } from "../support/moderation";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
const DETAIL = "GET /api/v1/admin/reports/11";
const RESOLVE = "POST /api/v1/admin/reports/11/resolve";
const TARGET = "PATCH /api/v1/admin/reports/11/target";

const post = (fields: Record<string, string>, id = "11") =>
  action(routeArgs<ActionArgs>(formRequest(`/admin/reports/${id}`, fields, loggedIn), { id }));

afterEach(() => vi.restoreAllMocks());

/** 신고 상세(005 T045) */
describe("admin report loader·action", () => {
  it("loader: GET /admin/reports/{id}, 없는 신고·숫자 아닌 id·관리자 아님은 404", async () => {
    mockBackend({ [ME]: ok(member()), [DETAIL]: ok(reportDetail()) });
    const call = (id: string) =>
      loader(routeArgs<LoaderArgs>(getRequest(`/admin/reports/${id}`, loggedIn), { id }));

    await expect(call("11")).resolves.toEqual({ report: reportDetail() });
    expect(statusOf(await caught(call("x")))).toBe(404);
    mockBackend({
      [ME]: ok(member()),
      "GET /api/v1/admin/reports/99": fail(404, "REPORT_NOT_FOUND"),
    });
    expect(statusOf(await caught(call("99")))).toBe(404);
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call("11")))).toBe(404);
    expect(statusOf(await caught(post({ intent: "resolve", op: "DISMISS" })))).toBe(404);
  });

  it("resolve: 숨김·작성자 정지(사유 필수)·기각과 메모", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [RESOLVE]: ok({ resolvedCount: 3, decision: "ACTIONED", action: "HIDE_CONTENT" }),
    });

    expect(asData(await post({ intent: "resolve", op: "HIDE", note: " 광고 " })).data).toEqual({
      intent: "resolve",
      ok: true,
      resolvedCount: 3,
    });
    await post({ intent: "resolve", op: "SUSPEND", suspendReason: " 반복 " });
    await post({ intent: "resolve", op: "DISMISS" });
    expect(backend.callsTo(RESOLVE).map((call) => call.body)).toEqual([
      { decision: "ACTION", action: "HIDE_CONTENT", note: "광고" },
      { decision: "ACTION", action: "SUSPEND_USER", suspendReason: "반복" },
      { decision: "DISMISS" },
    ]);

    expect(asData(await post({ intent: "resolve", op: "SUSPEND" })).data).toMatchObject({
      fieldErrors: [{ field: "suspendReason", code: "REQUIRED" }],
    });
    expect(
      asData(await post({ intent: "resolve", op: "SUSPEND", suspendReason: "가".repeat(501) }))
        .data,
    ).toMatchObject({ fieldErrors: [{ field: "suspendReason", code: "TOO_LONG" }] });
    expect(
      asData(await post({ intent: "resolve", op: "HIDE", note: "가".repeat(1001) })).data,
    ).toMatchObject({ fieldErrors: [{ field: "note", code: "TOO_LONG" }] });
    expect(asData(await post({ intent: "resolve", op: "WHAT" })).init?.status).toBe(400);
    expect(asData(await post({ intent: "nope" })).init?.status).toBe(400);
    expect(backend.callsTo(RESOLVE)).toHaveLength(3);
  });

  it("target: 주소(댓글 앵커) 또는 종류 + 번호로 PATCH, 해석할 수 없으면 입력 오류", async () => {
    const backend = mockBackend({ [ME]: ok(member()), [TARGET]: ok(reportDetail()) });

    await post({ intent: "target", targetUrl: "https://blog.java21.net/marco/1#comment-45" });
    await post({ intent: "target", targetUrl: "", targetType: "GUESTBOOK", targetId: "8" });
    expect(backend.callsTo(TARGET).map((call) => call.body)).toEqual([
      { targetType: "COMMENT", targetId: 45 },
      { targetType: "GUESTBOOK", targetId: 8 },
    ]);
    expect(
      asData(await post({ intent: "target", targetUrl: "https://x.example/" })).data,
    ).toMatchObject({
      fieldErrors: [{ field: "targetUrl", code: "INVALID_FORMAT" }],
    });
  });

  it("unhide: DELETE /admin/contents/{type}/{id}/hidden, 잘못된 대상은 입력 오류", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "DELETE /api/v1/admin/contents/comments/45/hidden": ok(preview({ type: "COMMENT", id: 45 })),
    });

    expect(
      asData(await post({ intent: "unhide", targetType: "COMMENT", targetId: "45" })).data,
    ).toEqual({
      intent: "unhide",
      ok: true,
    });
    expect(backend.callsTo("DELETE /api/v1/admin/contents/comments/45/hidden")).toHaveLength(1);
    expect(
      asData(await post({ intent: "unhide", targetType: "EXTERNAL_POST", targetId: "1" })).init
        ?.status,
    ).toBe(400);
  });

  it("backend 오류(REPORT_ALREADY_RESOLVED·REPORT_TARGET_REQUIRED·REPORT_ACTION_NOT_ALLOWED)는 폼 오류", async () => {
    for (const [status, code] of [
      [409, "REPORT_ALREADY_RESOLVED"],
      [422, "REPORT_TARGET_REQUIRED"],
      [422, "REPORT_ACTION_NOT_ALLOWED"],
    ] as const) {
      mockBackend({ [ME]: ok(member()), [RESOLVE]: fail(status, code) });
      const result = asData(await post({ intent: "resolve", op: "HIDE" }));
      expect(result.init?.status).toBe(status);
      expect(result.data).toMatchObject({ ok: false, resultCode: code });
    }
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });
});

describe("admin report 화면", () => {
  function renderReport(
    detail = reportDetail(),
    routes: Record<string, BackendHandler | Response> = {},
  ) {
    const backend = mockBackend({ [ME]: ok(member()), [DETAIL]: ok(detail), ...routes });
    renderRoutes(
      [
        {
          path: "admin/reports/:id",
          loader: stub(loader),
          action: stub(action),
          Component: Report,
        },
      ],
      { initialEntries: ["/admin/reports/11"] },
    );
    return backend;
  }

  it("대상 미리보기(원래 화면 열기)·작성 회원 신고 수·같은 대상의 신고(설명은 텍스트로)·처리 폼", async () => {
    renderReport();

    const target = await screen.findByRole("region", { name: "신고 대상" });
    expect(within(target).getByText("광고 글")).toBeInTheDocument();
    expect(within(target).getByText("싸게 팝니다")).toBeInTheDocument();
    expect(within(target).getByText("마르코의 블로그 (@marco)")).toBeInTheDocument();
    expect(within(target).getByRole("link", { name: "원래 화면 열기" })).toHaveAttribute(
      "href",
      "https://blog.java21.net/marco/123",
    );
    expect(target).toHaveTextContent("작성 회원이 받은 신고 4건");
    const list = screen.getByRole("region", { name: "같은 대상의 신고" });
    expect(list).toHaveTextContent("독자 · 스팸·광고");
    expect(within(list).getByText("<b>광고</b>입니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "숨김" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "기각" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "대상 지정" })).toBeNull();
  });

  it("권리 침해 신고: 주소·근거·연락 이메일, 대상 미정이면 대상 지정 폼(주소 미리 채움)", async () => {
    renderReport(
      reportDetail({
        channel: "RIGHTS_REQUEST",
        target: null,
        targetUrl: "https://blog.java21.net/marco/1",
        rightsBasis: "제 사진입니다",
        contactEmail: "owner@example.com",
        reports: [
          {
            id: 11,
            channel: "RIGHTS_REQUEST",
            reporter: null,
            reason: "COPYRIGHT",
            detail: null,
            createdAt: "2026-10-05T01:00:00Z",
          },
        ],
        targetUserReportCount: null,
      }),
    );

    const rights = await screen.findByRole("region", { name: "권리 침해 정보" });
    expect(rights).toHaveTextContent("owner@example.com");
    expect(rights).toHaveTextContent("제 사진입니다");
    expect(screen.getByText("대상이 아직 정해지지 않았습니다.")).toBeInTheDocument();
    const assign = screen.getByRole("group", { name: "대상 지정" });
    expect(within(assign).getByLabelText("주소")).toHaveValue("https://blog.java21.net/marco/1");
    expect(screen.getByText(/권리 침해 신고\(비회원\)/)).toBeInTheDocument();
  });

  it("작성자 정지는 확인을 묻고, 취소하면 보내지 않는다. 처리하면 처리 수 안내", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const backend = renderReport(reportDetail(), {
      [RESOLVE]: ok({ resolvedCount: 2, decision: "ACTIONED", action: "HIDE_CONTENT" }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "작성자 정지" }));
    expect(confirm).toHaveBeenCalled();
    expect(backend.callsTo(RESOLVE)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "숨김" }));
    expect(await screen.findByRole("status")).toHaveTextContent("신고 2건을 처리했습니다.");
    await waitFor(() => expect(backend.callsTo(RESOLVE)).toHaveLength(1));
  });

  it("처리된 신고는 결과·처리자·메모, 숨긴 대상은 숨김 해제 버튼", async () => {
    renderReport(
      reportDetail({
        status: "ACTIONED",
        action: "HIDE_CONTENT",
        handledBy: { id: 1, nickname: "운영자" },
        handledAt: "2026-10-06T00:00:00Z",
        resolutionNote: "광고",
        target: preview({
          state: "HIDDEN",
          author: { userId: null, nickname: "손님", guest: true },
        }),
      }),
    );

    const result = await screen.findByRole("region", { name: "처리 결과" });
    expect(result).toHaveTextContent("조치 · 숨김");
    expect(result).toHaveTextContent("운영자 ·");
    expect(result).toHaveTextContent("메모: 광고");
    expect(screen.getByText("비회원 손님")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "숨김 해제" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "처리" })).toBeNull();
  });

  it("오류 문구(이미 처리된 신고)", async () => {
    renderReport(reportDetail(), { [RESOLVE]: fail(409, "REPORT_ALREADY_RESOLVED") });
    fireEvent.click(await screen.findByRole("button", { name: "기각" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 처리된 신고입니다.");
  });

  it("007 외부 글: 숨김 대신 '포털에서 내림'(확인), 외부 블로그는 '외부 블로그 차단', 블로그 주소 없음", async () => {
    expect(operationsFor("EXTERNAL_POST")).toEqual(["REMOVE", "SUSPEND"]);
    expect(operationsFor("EXTERNAL_BLOG")).toEqual(["BLOCK", "SUSPEND"]);
    expect(operationsFor(undefined)).toEqual(["HIDE", "SUSPEND"]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const backend = renderReport(
      reportDetail({
        target: preview({
          type: "EXTERNAL_POST",
          id: 31,
          title: "외부 글 제목",
          url: "https://remote.example/1",
          blog: { handle: null, title: "Remote Blog" },
        }),
      }),
      {
        [RESOLVE]: ok({
          resolvedCount: 1,
          decision: "ACTIONED",
          action: "REMOVE_FROM_PORTAL",
        }),
      },
    );
    expect(await screen.findByText("Remote Blog")).toBeInTheDocument();
    expect(screen.queryByText(/@null/)).toBeNull();
    expect(screen.queryByRole("button", { name: "숨김" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "포털에서 내림" }));
    expect(confirm).toHaveBeenCalledWith("이 외부 글을 포털에서 내립니다. 되돌릴 수 없습니다.");
    expect(backend.callsTo(RESOLVE)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "포털에서 내림" }));
    await waitFor(() => expect(backend.callsTo(RESOLVE)).toHaveLength(1));
    expect(backend.callsTo(RESOLVE)[0].body).toEqual({
      decision: "ACTION",
      action: "REMOVE_FROM_PORTAL",
    });
  });

  it("처리된 외부 블로그 신고는 조치 이름 '외부 블로그 차단'", async () => {
    renderReport(
      reportDetail({
        status: "ACTIONED",
        action: "BLOCK_EXTERNAL_BLOG",
        target: preview({ type: "EXTERNAL_BLOG", id: 3, state: "DELETED", blog: null }),
      }),
    );
    const result = await screen.findByRole("region", { name: "처리 결과" });
    expect(result).toHaveTextContent("외부 블로그 차단");
  });

  it("action: BLOCK은 BLOCK_EXTERNAL_BLOG", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [RESOLVE]: ok({ resolvedCount: 1, decision: "ACTIONED", action: "BLOCK_EXTERNAL_BLOG" }),
    });
    await post({ intent: "resolve", op: "BLOCK", note: "피싱" });
    expect(backend.callsTo(RESOLVE)[0].body).toEqual({
      decision: "ACTION",
      action: "BLOCK_EXTERNAL_BLOG",
      note: "피싱",
    });
  });
});
