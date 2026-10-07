// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import User, { action, loader, meta } from "~/routes/admin/user";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { userDetail } from "../support/moderation";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
const DETAIL = "GET /api/v1/admin/users/7";
const SUSPEND = "POST /api/v1/admin/users/7/suspend";
const UNSUSPEND = "POST /api/v1/admin/users/7/unsuspend";
const LIMIT = "PATCH /api/v1/admin/users/7/blog-limit";

const post = (fields: Record<string, string>, id = "7") =>
  action(routeArgs<ActionArgs>(formRequest(`/admin/users/${id}`, fields, loggedIn), { id }));

afterEach(() => vi.restoreAllMocks());

/** 회원 상세(005 T046) */
describe("admin user loader·action", () => {
  it("loader: GET /admin/users/{id}, 없는 회원·잘못된 id는 404", async () => {
    mockBackend({ [ME]: ok(member()), [DETAIL]: ok(userDetail()) });
    const call = (id: string) =>
      loader(routeArgs<LoaderArgs>(getRequest(`/admin/users/${id}`, loggedIn), { id }));

    await expect(call("7")).resolves.toEqual({ user: userDetail() });
    expect(statusOf(await caught(call("abc")))).toBe(404);
    mockBackend({ [ME]: ok(member()), "GET /api/v1/admin/users/8": fail(404, "USER_NOT_FOUND") });
    expect(statusOf(await caught(call("8")))).toBe(404);
    expect(statusOf(await caught(post({ intent: "suspend", reason: "a" }, "x")))).toBe(404);
  });

  it("정지(사유 필수·500자)·해제(메모 선택)", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [SUSPEND]: ok(userDetail({ status: "SUSPENDED" })),
      [UNSUSPEND]: ok(userDetail()),
    });

    expect(asData(await post({ intent: "suspend", reason: " 스팸 " })).data).toEqual({
      intent: "suspend",
      ok: true,
    });
    await post({ intent: "unsuspend", reason: "" });
    await post({ intent: "unsuspend", reason: "소명" });
    expect(backend.callsTo(SUSPEND)[0].body).toEqual({ reason: "스팸" });
    expect(backend.callsTo(UNSUSPEND).map((call) => call.body)).toEqual([{}, { reason: "소명" }]);

    expect(asData(await post({ intent: "suspend", reason: " " })).data).toMatchObject({
      fieldErrors: [{ field: "reason", code: "REQUIRED" }],
    });
    expect(asData(await post({ intent: "suspend", reason: "가".repeat(501) })).data).toMatchObject({
      fieldErrors: [{ field: "reason", code: "TOO_LONG", params: { max: 500 } }],
    });
    expect(asData(await post({ intent: "nope" })).init?.status).toBe(400);
  });

  it("블로그 한도: 숫자는 그 값, 기본값으로는 null(003 API)", async () => {
    const backend = mockBackend({ [ME]: ok(member()), [LIMIT]: ok({}) });

    await post({ intent: "blogLimit", maxBlogs: "5" });
    await post({ intent: "blogLimit", maxBlogs: "5", reset: "1" });
    expect(backend.callsTo(LIMIT).map((call) => call.body)).toEqual([
      { maxBlogs: 5 },
      { maxBlogs: null },
    ]);
    expect(asData(await post({ intent: "blogLimit", maxBlogs: "-1" })).data).toMatchObject({
      fieldErrors: [{ field: "maxBlogs", code: "INVALID_FORMAT" }],
    });
  });

  it("CANNOT_SUSPEND_SELF·LAST_SUPER_ADMIN·USER_NOT_ACTIVE·FORBIDDEN은 폼 오류(관리자 아님 403은 404)", async () => {
    for (const [status, code] of [
      [422, "CANNOT_SUSPEND_SELF"],
      [409, "LAST_SUPER_ADMIN"],
      [409, "USER_NOT_ACTIVE"],
    ] as const) {
      mockBackend({ [ME]: ok(member()), [SUSPEND]: fail(status, code) });
      expect(asData(await post({ intent: "suspend", reason: "a" })).data).toMatchObject({
        ok: false,
        resultCode: code,
      });
    }
    mockBackend({ [ME]: ok(member()), [SUSPEND]: fail(403, "FORBIDDEN") });
    expect(statusOf(await caught(post({ intent: "suspend", reason: "a" })))).toBe(404);
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });
});

describe("admin user 화면", () => {
  function renderUser(
    detail = userDetail(),
    routes: Record<string, BackendHandler | Response> = {},
  ) {
    const backend = mockBackend({ [ME]: ok(member()), [DETAIL]: ok(detail), ...routes });
    renderRoutes(
      [{ path: "admin/users/:id", loader: stub(loader), action: stub(action), Component: User }],
      { initialEntries: ["/admin/users/7"] },
    );
    return backend;
  }

  it("가입일·상태·권한·글 수·받은 신고·최근 로그인·블로그 목록·한도 폼·정지 폼", async () => {
    renderUser();

    expect(await screen.findByRole("heading", { name: "회원 상세: 마르코" })).toBeInTheDocument();
    const facts = document.querySelector(".admin-user-facts")!;
    expect(facts).toHaveTextContent("상태정상");
    expect(facts).toHaveTextContent("권한회원");
    expect(facts).toHaveTextContent("글 수12");
    expect(facts).toHaveTextContent("받은 신고3");
    expect(screen.getByRole("link", { name: "마르코의 블로그" })).toHaveAttribute("href", "/marco");
    expect(screen.getByText(/옛 블로그/).closest("li")).toHaveTextContent("(삭제됨)");
    const limit = screen.getByRole("group", { name: "블로그 수 한도" });
    expect(limit).toHaveTextContent("블로그 1개 / 한도 3개 (기본 한도)");
    expect(within(limit).getByRole("spinbutton", { name: "한도" })).toHaveValue(3);
    expect(within(limit).queryByRole("button", { name: "기본값으로" })).toBeNull();
    expect(screen.getByRole("group", { name: "정지" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "정지 해제" })).toBeNull();
  });

  it("정지는 확인을 묻고, 확인하면 보내고 결과 안내. 오류 문구", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const backend = renderUser(userDetail(), { [SUSPEND]: fail(422, "CANNOT_SUSPEND_SELF") });

    const form = await screen.findByRole("group", { name: "정지" });
    fireEvent.change(within(form).getByLabelText("정지 사유"), { target: { value: "스팸" } });
    fireEvent.click(within(form).getByRole("button", { name: "정지" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(backend.callsTo(SUSPEND)).toHaveLength(0);

    fireEvent.click(within(form).getByRole("button", { name: "정지" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("자기 자신은 정지할 수 없습니다.");
  });

  it("정지된 회원은 해제 폼, 회원별 한도면 기본값으로 버튼, 로그인 기록이 없으면 없음", async () => {
    const backend = renderUser(
      userDetail({
        status: "SUSPENDED",
        lastLoginAt: null,
        blogs: [],
        blogLimit: { current: 0, limit: 5, custom: true },
      }),
      { [UNSUSPEND]: ok(userDetail()) },
    );

    const form = await screen.findByRole("group", { name: "정지 해제" });
    expect(screen.getByText("블로그가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "기본값으로" })).toBeInTheDocument();
    expect(document.querySelector(".admin-user-facts")).toHaveTextContent("최근 로그인없음");
    fireEvent.click(within(form).getByRole("button", { name: "정지 해제" }));
    expect(await screen.findByRole("status")).toHaveTextContent("정지를 해제했습니다.");
    expect(backend.callsTo(UNSUSPEND)).toHaveLength(1);
  });
});
