import { describe, expect, it } from "vitest";

import { runReportAction, withReportParam } from "~/components/report/actions.server";
import { isReportResult } from "~/components/report/actions";
import {
  REPORT_DETAIL_MAX,
  isHttpUrl,
  reportFieldErrors,
  rightsRequestFieldErrors,
} from "~/moderation/reasons";
import {
  hiddenContentPath,
  parseReportKey,
  parseTargetUrl,
  reportKey,
  rightsRequestHref,
  targetAnchor,
} from "~/moderation/reportTarget";

import { fail, mockBackend, ok } from "../support/backend";
import { asData, caught, expectRedirect, formRequest } from "../support/route";

const REPORTS = "POST /api/v1/reports";

describe("신고 대상 열쇠·앵커(005 T043)", () => {
  it("열쇠와 앵커, 거꾸로 읽기", () => {
    expect(reportKey("COMMENT", 12)).toBe("comment-12");
    expect(parseReportKey("guestbook-7")).toEqual({ type: "GUESTBOOK", id: 7 });
    expect(parseReportKey("post-1")).toEqual({ type: "POST", id: 1 });
    expect(parseReportKey("user-1")).toBeNull();
    expect(parseReportKey("comment-0")).toBeNull();
    expect(parseReportKey(null)).toBeNull();
    expect(targetAnchor("POST", 3)).toBe("");
    expect(targetAnchor("TRACKBACK", 3)).toBe("#trackback-3");
    expect(rightsRequestHref("/marco/3#comment-9")).toBe(
      "/rights-request?url=%2Fmarco%2F3%23comment-9",
    );
    expect(hiddenContentPath("GUESTBOOK", 5)).toBe("/admin/contents/guestbook-entries/5/hidden");
  });

  it("관리자 대상 지정 주소 해석: 글 주소, 댓글·방명록·트랙백 앵커", () => {
    expect(parseTargetUrl("https://blog.java21.net/marco/123")).toEqual({ type: "POST", id: 123 });
    expect(parseTargetUrl("/marco/123/")).toEqual({ type: "POST", id: 123 });
    expect(parseTargetUrl("https://blog.java21.net/marco/123#comment-45")).toEqual({
      type: "COMMENT",
      id: 45,
    });
    expect(parseTargetUrl("/marco/guestbook#guestbook-8")).toEqual({ type: "GUESTBOOK", id: 8 });
    expect(parseTargetUrl("/marco/1#trackback-2")).toEqual({ type: "TRACKBACK", id: 2 });
    expect(parseTargetUrl("/marco/guestbook")).toBeNull();
    expect(parseTargetUrl("http://[bad")).toBeNull();
  });
});

describe("신고 입력 검사", () => {
  it("사유 필수·모르는 사유, 기타면 설명 필수, 1000자", () => {
    expect(reportFieldErrors("SPAM", "")).toEqual([]);
    expect(reportFieldErrors("", "")).toEqual([{ field: "reason", code: "REQUIRED" }]);
    expect(reportFieldErrors("NOPE", "")).toEqual([{ field: "reason", code: "INVALID" }]);
    expect(reportFieldErrors("OTHER", "")).toEqual([{ field: "detail", code: "REQUIRED" }]);
    expect(reportFieldErrors("SPAM", "가".repeat(REPORT_DETAIL_MAX + 1))).toEqual([
      { field: "detail", code: "TOO_LONG", params: { max: 1000 } },
    ]);
  });

  it("권리 침해 신고: 주소(http/https, 1000자)·사유 4개·근거 2000자·이메일", () => {
    const valid = {
      targetUrl: "https://blog.java21.net/marco/1",
      reason: "COPYRIGHT",
      rightsBasis: "제가 쓴 글입니다",
      contactEmail: "owner@example.com",
    };
    expect(rightsRequestFieldErrors(valid)).toEqual([]);
    expect(
      rightsRequestFieldErrors({ targetUrl: "", reason: "", rightsBasis: "", contactEmail: "" }),
    ).toEqual([
      { field: "targetUrl", code: "REQUIRED" },
      { field: "reason", code: "REQUIRED" },
      { field: "rightsBasis", code: "REQUIRED" },
      { field: "contactEmail", code: "REQUIRED" },
    ]);
    expect(
      rightsRequestFieldErrors({
        targetUrl: "ftp://x",
        reason: "SPAM",
        rightsBasis: "가".repeat(2001),
        contactEmail: "no-at",
      }),
    ).toEqual([
      { field: "targetUrl", code: "INVALID_FORMAT" },
      { field: "reason", code: "INVALID" },
      { field: "rightsBasis", code: "TOO_LONG", params: { max: 2000 } },
      { field: "contactEmail", code: "INVALID_FORMAT" },
    ]);
    expect(
      rightsRequestFieldErrors({ ...valid, targetUrl: `https://a.b/${"x".repeat(1000)}` }),
    ).toEqual([{ field: "targetUrl", code: "TOO_LONG", params: { max: 1000 } }]);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("신고 action(intent=report)", () => {
  const post = (fields: Record<string, string>, returnTo = "/marco/123") =>
    runReportAction(
      formRequest("/marco/123", { intent: "report", ...fields }, { cookie: "access_token=a" }),
      {
        returnTo,
      },
    );

  it("POST /reports 본문(설명은 있을 때만), 결과에 대상 열쇠", async () => {
    const backend = mockBackend({ [REPORTS]: ok({ id: 1, status: "PENDING" }, { status: 201 }) });

    const result = asData(
      await post({ targetType: "COMMENT", targetId: "45", reason: "SPAM", detail: " " }),
    );
    expect(result.data).toEqual({ intent: "report", ok: true, key: "comment-45" });
    expect(isReportResult(result.data)).toBe(true);
    expect(backend.callsTo(REPORTS)[0].body).toEqual({
      targetType: "COMMENT",
      targetId: 45,
      reason: "SPAM",
    });

    await post({ targetType: "POST", targetId: "123", reason: "OTHER", detail: " 광고 글 " });
    expect(backend.callsTo(REPORTS)[1].body).toEqual({
      targetType: "POST",
      targetId: 123,
      reason: "OTHER",
      detail: "광고 글",
    });
  });

  it("잘못된 대상·사유는 backend를 부르지 않는다", async () => {
    const backend = mockBackend({});

    expect(
      asData(await post({ targetType: "USER", targetId: "1", reason: "SPAM" })).init?.status,
    ).toBe(400);
    expect(
      asData(await post({ targetType: "POST", targetId: "x", reason: "SPAM" })).init?.status,
    ).toBe(400);
    expect(
      asData(await post({ targetType: "POST", targetId: "1", reason: "OTHER" })).data,
    ).toMatchObject({
      key: "post-1",
      fieldErrors: [{ field: "detail", code: "REQUIRED" }],
    });
    expect(backend.calls).toHaveLength(0);
    expect(isReportResult(null)).toBe(false);
  });

  it("REPORT_ALREADY_EXISTS·REPORT_TARGET_NOT_FOUND·429는 폼 오류, 401은 신고 폼이 열린 화면으로 돌아오는 로그인", async () => {
    mockBackend({ [REPORTS]: fail(409, "REPORT_ALREADY_EXISTS") });
    const already = asData(await post({ targetType: "POST", targetId: "1", reason: "SPAM" }));
    expect(already.init?.status).toBe(409);
    expect(already.data).toMatchObject({
      ok: false,
      resultCode: "REPORT_ALREADY_EXISTS",
      key: "post-1",
    });

    mockBackend({ [REPORTS]: fail(429, "TOO_MANY_REQUESTS", [], { "Retry-After": "60" }) });
    expect(
      asData(await post({ targetType: "POST", targetId: "1", reason: "SPAM" })).data,
    ).toMatchObject({
      resultCode: "TOO_MANY_REQUESTS",
      retryAfter: 60,
    });

    mockBackend({ [REPORTS]: fail(401, "UNAUTHENTICATED") });
    const location = expectRedirect(
      await caught(
        post({ targetType: "COMMENT", targetId: "9", reason: "SPAM" }, "/marco/guestbook?page=2"),
      ),
    );
    expect(decodeURIComponent(location)).toContain("/marco/guestbook?page=2&report=comment-9");
    expect(withReportParam("/marco/1", "post-1")).toBe("/marco/1?report=post-1");
  });
});
