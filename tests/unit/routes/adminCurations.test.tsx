// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminPortalPost, Curation } from "~/api/models";
import Curations, { action, loader } from "~/routes/admin/curations";

import { ME, loggedIn, member, stub } from "../support/admin";
import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type Args = Parameters<typeof action>[0];
const LIST = "GET /api/v1/admin/portal/curations";

const curation = (id: number, overrides: Partial<Curation> = {}): Curation => ({
  id,
  post: { id: 100 + id, title: `추천 글 ${id}`, blogHandle: "marco" },
  startsAt: "2026-10-06T00:00:00Z",
  endsAt: "2026-10-13T00:00:00Z",
  sortOrder: id,
  status: "ACTIVE",
  portalEligible: true,
  createdBy: { userId: 1, nickname: "운영자", profileImageUrl: null } as Curation["createdBy"],
  createdAt: "2026-10-05T00:00:00Z",
  updatedAt: "2026-10-05T00:00:00Z",
  ...overrides,
});

const portalPost = (overrides: Partial<AdminPortalPost> = {}): AdminPortalPost => ({
  id: 123,
  title: "확인한 글",
  blog: { handle: "marco", title: "마르코의 블로그" },
  status: "PUBLISHED",
  visibility: "PUBLIC",
  publishedAt: "2026-10-01T00:00:00Z",
  portalEligible: true,
  ineligibleReasons: [],
  excluded: null,
  ...overrides,
});

/** 포털 추천(003 T091) */
describe("포털 추천 loader·action", () => {
  it("loader: 상태(기본 ACTIVE)와 페이지(0부터)로 목록, 전체 수와 관리자 시간대", async () => {
    const backend = mockBackend({
      [ME]: ok(member("ADMIN", "America/New_York")),
      [LIST]: ok([curation(1)], { totalCount: 41 }),
    });
    const load = (path: string) =>
      loader(routeArgs<Parameters<typeof loader>[0]>(getRequest(path, loggedIn)));

    await expect(load("/admin/portal/curations")).resolves.toEqual({
      status: "ACTIVE",
      page: 1,
      curations: [curation(1)],
      totalCount: 41,
      timeZone: "America/New_York",
    });
    await load("/admin/portal/curations?status=ENDED&page=3");
    await load("/admin/portal/curations?status=weird");

    expect(backend.callsTo(LIST).map((call) => Object.fromEntries(call.url.searchParams))).toEqual([
      { status: "ACTIVE", page: "0", size: "20" },
      { status: "ENDED", page: "2", size: "20" },
      { status: "ACTIVE", page: "0", size: "20" },
    ]);
  });

  it("lookup: 글 주소에서 번호를 꺼내 /admin/portal/posts/{id}로 확인", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "GET /api/v1/admin/portal/posts/123": ok(portalPost()),
    });

    const result = asData(
      await action(
        routeArgs<Args>(
          formRequest(
            "/admin/portal/curations",
            { intent: "lookup", postRef: "https://blog.java21.net/marco/123" },
            loggedIn,
          ),
        ),
      ),
    );

    expect(result.data).toEqual({ intent: "lookup", ok: true, post: portalPost() });
    expect(backend.callsTo("GET /api/v1/admin/portal/posts/123")).toHaveLength(1);
  });

  it("lookup: 알아볼 수 없는 값은 400, 없는 글은 POST_NOT_FOUND", async () => {
    mockBackend({
      [ME]: ok(member()),
      "GET /api/v1/admin/portal/posts/9": fail(404, "POST_NOT_FOUND"),
    });
    const lookup = (postRef: string) =>
      action(
        routeArgs<Args>(
          formRequest("/admin/portal/curations", { intent: "lookup", postRef }, loggedIn),
        ),
      );

    expect(asData(await lookup("hello")).data).toMatchObject({
      fieldErrors: [{ field: "postRef", code: "INVALID_FORMAT" }],
    });
    const missing = asData(await lookup("9"));
    expect(missing.init?.status).toBe(404);
    expect(missing.data).toMatchObject({ ok: false, resultCode: "POST_NOT_FOUND" });
  });

  it("추가: 기간은 관리자 시간대 → UTC, 순서 생략은 0", async () => {
    const backend = mockBackend({
      [ME]: ok(member("ADMIN", "Asia/Seoul")),
      "POST /api/v1/admin/portal/curations": ok(curation(9), { status: 201 }),
    });

    const result = asData(
      await action(
        routeArgs<Args>(
          formRequest(
            "/admin/portal/curations",
            {
              intent: "create",
              postId: "123",
              startsAt: "2026-10-06T09:00",
              endsAt: "2026-10-13T09:00",
              sortOrder: "",
            },
            loggedIn,
          ),
        ),
      ),
    );

    expect(result.data).toEqual({ intent: "create", ok: true });
    expect(backend.callsTo("POST /api/v1/admin/portal/curations")[0].body).toEqual({
      postId: 123,
      startsAt: "2026-10-06T00:00:00Z",
      endsAt: "2026-10-13T00:00:00Z",
      sortOrder: 0,
    });
  });

  it("추가: 기간이 비거나 순서가 숫자가 아니면 backend를 부르지 않는다", async () => {
    const backend = mockBackend({ [ME]: ok(member()) });

    const result = asData(
      await action(
        routeArgs<Args>(
          formRequest(
            "/admin/portal/curations",
            { intent: "create", postId: "123", startsAt: "", endsAt: "x", sortOrder: "1.5" },
            loggedIn,
          ),
        ),
      ),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({
      fieldErrors: [
        { field: "startsAt", code: "REQUIRED" },
        { field: "endsAt", code: "REQUIRED" },
        { field: "sortOrder", code: "INVALID" },
      ],
    });
    expect(backend.calls.map((call) => call.path)).toEqual(["/api/v1/me"]);
  });

  it("수정은 PATCH, 삭제는 DELETE /admin/portal/curations/{id}", async () => {
    const backend = mockBackend({
      [ME]: ok(member("ADMIN", "UTC")),
      "PATCH /api/v1/admin/portal/curations/5": ok(curation(5)),
      "DELETE /api/v1/admin/portal/curations/5": ok(null),
    });
    const post = (fields: Record<string, string>) =>
      action(routeArgs<Args>(formRequest("/admin/portal/curations", fields, loggedIn)));

    await post({
      intent: "update",
      id: "5",
      startsAt: "2026-10-06T00:00",
      endsAt: "2026-10-07T00:00",
      sortOrder: "3",
    });
    expect(asData(await post({ intent: "delete", id: "5" })).data).toEqual({
      intent: "delete",
      ok: true,
    });

    expect(backend.callsTo("PATCH /api/v1/admin/portal/curations/5")[0].body).toEqual({
      startsAt: "2026-10-06T00:00:00Z",
      endsAt: "2026-10-07T00:00:00Z",
      sortOrder: 3,
    });
    expect(backend.callsTo("DELETE /api/v1/admin/portal/curations/5")).toHaveLength(1);
  });

  it("오류: CURATION_LIMIT_EXCEEDED(409)·POST_NOT_PORTAL_ELIGIBLE(422), 모르는 intent·번호 400", async () => {
    mockBackend({
      [ME]: ok(member()),
      "POST /api/v1/admin/portal/curations": fail(409, "CURATION_LIMIT_EXCEEDED"),
      "PATCH /api/v1/admin/portal/curations/5": fail(422, "POST_NOT_PORTAL_ELIGIBLE"),
    });
    const post = (fields: Record<string, string>) =>
      action(routeArgs<Args>(formRequest("/admin/portal/curations", fields, loggedIn)));
    const period = { startsAt: "2026-10-06T00:00", endsAt: "2026-10-07T00:00" };

    const limit = asData(await post({ intent: "create", postId: "1", ...period }));
    expect(limit.init?.status).toBe(409);
    expect(limit.data).toMatchObject({ resultCode: "CURATION_LIMIT_EXCEEDED" });
    const ineligible = asData(await post({ intent: "update", id: "5", ...period }));
    expect(ineligible.data).toMatchObject({ resultCode: "POST_NOT_PORTAL_ELIGIBLE" });
    expect(asData(await post({ intent: "x" })).init?.status).toBe(400);
    expect(asData(await post({ intent: "delete", id: "" })).init?.status).toBe(400);
  });

  it("관리자가 아니면 loader·action 모두 404", async () => {
    mockBackend({ [ME]: ok(member("USER")) });

    expect(
      statusOf(
        await caught(
          loader(
            routeArgs<Parameters<typeof loader>[0]>(
              getRequest("/admin/portal/curations", loggedIn),
            ),
          ),
        ),
      ),
    ).toBe(404);
    expect(
      statusOf(
        await caught(
          action(
            routeArgs<Args>(
              formRequest("/admin/portal/curations", { intent: "delete", id: "1" }, loggedIn),
            ),
          ),
        ),
      ),
    ).toBe(404);
  });
});

describe("포털 추천 화면", () => {
  function renderCurations(
    routes: Record<string, BackendHandler | Response> = {},
    entry = "/admin/portal/curations",
  ) {
    const backend = mockBackend({
      [ME]: ok(member()),
      [LIST]: ok([curation(1), curation(2, { portalEligible: false })], { totalCount: 2 }),
      ...routes,
    });
    renderRoutes(
      [
        {
          path: "admin/portal/curations",
          loader: stub(loader),
          action: stub(action),
          Component: Curations,
        },
      ],
      { initialEntries: [entry] },
    );
    return backend;
  }

  it("상태 탭, 목록(기간·순서·지정한 관리자), 노출 조건을 잃은 추천 표시, 수정 폼은 관리자 시간대 값", async () => {
    renderCurations();

    const tabs = await screen.findByRole("navigation", { name: "추천 상태" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["진행 중", "/admin/portal/curations?status=ACTIVE"],
      ["예정", "/admin/portal/curations?status=UPCOMING"],
      ["종료", "/admin/portal/curations?status=ENDED"],
    ]);
    expect(within(tabs).getByRole("link", { name: "진행 중" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const first = screen.getByRole("region", { name: "추천 글 1" });
    expect(first).toHaveTextContent("순서 1");
    expect(first).toHaveTextContent("지정: 운영자");
    expect(within(first).getByLabelText("시작")).toHaveValue("2026-10-06T09:00");
    expect(within(first).getByLabelText("종료")).toHaveValue("2026-10-13T09:00");
    expect(first).not.toHaveTextContent("포털 노출 조건을 잃어");
    expect(screen.getByRole("region", { name: "추천 글 2" })).toHaveTextContent(
      "포털 노출 조건을 잃어 지금은 보이지 않습니다.",
    );
    expect(screen.getByText("시각은 Asia/Seoul 기준입니다.")).toBeInTheDocument();
  });

  it("글 확인 → 노출 가능하면 기간을 넣어 추가, 끝나면 안내", async () => {
    const backend = renderCurations({
      "GET /api/v1/admin/portal/posts/123": ok(portalPost()),
      "POST /api/v1/admin/portal/curations": ok(curation(9), { status: 201 }),
    });

    fireEvent.change(await screen.findByLabelText("글 주소 또는 번호"), {
      target: { value: "/marco/123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "글 확인" }));
    const found = await screen.findByRole("region", { name: "확인한 글" });
    expect(found).toHaveTextContent("확인한 글");
    expect(found).toHaveTextContent("포털에 노출할 수 있는 글입니다.");
    fireEvent.change(within(found).getByLabelText("시작"), {
      target: { value: "2026-10-06T09:00" },
    });
    fireEvent.change(within(found).getByLabelText("종료"), {
      target: { value: "2026-10-08T09:00" },
    });
    fireEvent.click(within(found).getByRole("button", { name: "추천 추가" }));

    expect(await screen.findByRole("status")).toHaveTextContent("추천을 추가했습니다.");
    expect(backend.callsTo("POST /api/v1/admin/portal/curations")[0].body).toMatchObject({
      postId: 123,
      startsAt: "2026-10-06T00:00:00Z",
      endsAt: "2026-10-08T00:00:00Z",
    });
    expect(screen.queryByRole("region", { name: "확인한 글" })).toBeNull();
  });

  it("노출 조건을 만족하지 않는 글은 이유를 보여주고 추가 폼이 없다", async () => {
    renderCurations({
      "GET /api/v1/admin/portal/posts/123": ok(
        portalPost({
          portalEligible: false,
          ineligibleReasons: ["EXCLUDED", "TOO_SHORT", "SOMETHING_NEW"],
          excluded: {
            reason: "광고",
            excludedBy: { userId: 1, nickname: "운영자" } as never,
            createdAt: "2026-10-01T00:00:00Z",
          },
        }),
      ),
    });

    fireEvent.change(await screen.findByLabelText("글 주소 또는 번호"), {
      target: { value: "123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "글 확인" }));

    const found = await screen.findByRole("region", { name: "확인한 글" });
    expect(found).toHaveTextContent("지금은 포털에 노출되지 않는 글입니다.");
    expect(found).toHaveTextContent("운영자가 포털에서 제외함");
    expect(found).toHaveTextContent("본문이 최소 길이보다 짧음");
    expect(found).toHaveTextContent("SOMETHING_NEW");
    expect(found).toHaveTextContent("포털에서 제외된 글입니다(사유: 광고).");
    expect(within(found).queryByRole("button", { name: "추천 추가" })).toBeNull();
  });

  it("6번째 추천(CURATION_LIMIT_EXCEEDED) 문구", async () => {
    renderCurations({
      "PATCH /api/v1/admin/portal/curations/1": fail(409, "CURATION_LIMIT_EXCEEDED"),
    });

    const first = await screen.findByRole("region", { name: "추천 글 1" });
    fireEvent.click(within(first).getByRole("button", { name: "기간·순서 저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "기간이 겹치는 추천이 이미 5개입니다.",
    );
  });

  it("삭제하면 안내, 목록이 비면 안내, 페이지가 여럿이면 상태를 유지한 페이지 링크", async () => {
    renderCurations(
      {
        [LIST]: ok([], { totalCount: 45 }),
      },
      "/admin/portal/curations?status=UPCOMING&page=2",
    );

    expect(await screen.findByText("이 상태의 추천이 없습니다.")).toBeInTheDocument();
    const pages = screen.getByRole("navigation", { name: /페이지/ });
    expect(within(pages).getByRole("link", { name: "3" })).toHaveAttribute(
      "href",
      "/admin/portal/curations?status=UPCOMING&page=3",
    );
    expect(within(pages).getByRole("link", { name: "1" })).toHaveAttribute(
      "href",
      "/admin/portal/curations?status=UPCOMING",
    );
  });

  it("삭제", async () => {
    const backend = renderCurations({
      "DELETE /api/v1/admin/portal/curations/2": ok(null),
    });

    const second = await screen.findByRole("region", { name: "추천 글 2" });
    fireEvent.click(within(second).getByRole("button", { name: "삭제" }));

    expect(await screen.findByRole("status")).toHaveTextContent("추천을 삭제했습니다.");
    expect(backend.callsTo("DELETE /api/v1/admin/portal/curations/2")).toHaveLength(1);
  });
});
