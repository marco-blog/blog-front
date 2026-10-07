// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BlockedUser } from "~/api/models";
import { blockableUserId, isBlockIntent } from "~/manage/blocks";
import ManageBlocks, { BLOCKS_PAGE_SIZE, action, loader, meta } from "~/routes/manage/blocks";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
  withCookie,
} from "../support/route";

/** 차단 목록 화면(T117, 004 FR-146) */
type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type MetaArgs = Parameters<typeof meta>[0];

const ME = "GET /api/v1/me";
const BLOCKS = "GET /api/v1/blogs/marco/blocks";
const BLOCK_7 = "PUT /api/v1/blogs/marco/blocks/7";
const UNBLOCK_7 = "DELETE /api/v1/blogs/marco/blocks/7";
const loggedIn = { cookie: "access_token=a" };
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

function blocked(userId: number, nickname: string): BlockedUser {
  return {
    user: { userId, nickname, profileImageUrl: null },
    blockedAt: "2026-10-07T00:00:00Z",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("차단 loader·action", () => {
  it("loader: 쪽 번호를 0부터로 바꿔 20개씩 읽고, 403은 404", async () => {
    const list = [blocked(7, "나그네")];
    const backend = mockBackend({ [ME]: ok(me), [BLOCKS]: ok(list, { totalCount: 21 }) });
    const args = (url: string) =>
      routeArgs<LoaderArgs>(getRequest(url, loggedIn), { handle: "marco" });
    await expect(loader(args("/marco/manage/blocks?page=2"))).resolves.toEqual({
      handle: "marco",
      page: 2,
      blocks: list,
      totalCount: 21,
    });
    const query = backend.callsTo(BLOCKS)[0].url.searchParams;
    expect(query.get("page")).toBe("1");
    expect(query.get("size")).toBe(String(BLOCKS_PAGE_SIZE));

    mockBackend({ [ME]: ok(me), [BLOCKS]: fail(403, "FORBIDDEN") });
    expect(statusOf(await caught(loader(args("/marco/manage/blocks"))))).toBe(404);
  });

  it("action: block은 PUT, unblock은 DELETE, 403은 404, 잘못된 입력은 400", async () => {
    const call = (fields: Record<string, string>) =>
      action(
        routeArgs<ActionArgs>(formRequest("/marco/manage/blocks", fields, loggedIn), {
          handle: "marco",
        }),
      );
    const backend = mockBackend({
      [ME]: ok(me),
      [BLOCK_7]: ok(null),
      [UNBLOCK_7]: ok(null),
    });
    expect(asData(await call({ intent: "block", userId: "7", nickname: " 나그네 " })).data).toEqual(
      { intent: "block", ok: true, nickname: "나그네" },
    );
    expect(backend.callsTo(BLOCK_7)).toHaveLength(1);
    expect(asData(await call({ intent: "unblock", userId: "7" })).data).toEqual({
      intent: "unblock",
      ok: true,
      nickname: null,
    });
    expect(backend.callsTo(UNBLOCK_7)).toHaveLength(1);

    expect(asData(await call({ intent: "block", userId: "x" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "mute", userId: "7" })).data).toMatchObject({
      intent: "block",
      ok: false,
    });

    mockBackend({ [ME]: ok(me), [BLOCK_7]: fail(404, "USER_NOT_FOUND") });
    const missing = asData<Record<string, unknown>>(await call({ intent: "block", userId: "7" }));
    expect(missing.data).toMatchObject({
      intent: "block",
      ok: false,
      resultCode: "USER_NOT_FOUND",
    });
    expect(missing.init?.status).toBe(404);

    mockBackend({ [ME]: ok(me), [UNBLOCK_7]: fail(403, "FORBIDDEN") });
    expect(statusOf(await caught(call({ intent: "unblock", userId: "7" })))).toBe(404);
  });

  it("meta는 noindex", () => {
    expect(
      meta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as unknown as MetaArgs),
    ).toEqual([{ title: "차단 목록 - 블로그" }, { name: "robots", content: "noindex" }]);
  });

  it("도우미: 차단 작업 이름과 차단할 수 있는 작성자", () => {
    expect(isBlockIntent("block")).toBe(true);
    expect(isBlockIntent("unblock")).toBe(true);
    expect(isBlockIntent("delete")).toBe(false);
    expect(isBlockIntent(undefined)).toBe(false);
    const member = { userId: 7, nickname: "나그네", profileImageUrl: null, guest: false };
    expect(blockableUserId(member, 1)).toBe(7);
    expect(blockableUserId(member, 7)).toBeNull();
    expect(blockableUserId({ ...member, guest: true, userId: null }, 1)).toBeNull();
    expect(blockableUserId({ ...member, userId: null }, 1)).toBeNull();
    expect(blockableUserId(null, 1)).toBeNull();
  });
});

describe("차단 목록 화면", () => {
  function renderBlocks(list: () => BlockedUser[], extra: Record<string, Response> = {}) {
    const backend = mockBackend({ [ME]: ok(me), [BLOCKS]: () => ok(list()), ...extra });
    renderRoutes(
      [
        {
          path: ":handle/manage/blocks",
          loader: withCookie(loader as never) as never,
          action: withCookie(action as never) as never,
          Component: ManageBlocks,
        },
      ],
      { initialEntries: ["/marco/manage/blocks"] },
    );
    return backend;
  }

  it("빈 목록 안내", async () => {
    renderBlocks(() => []);
    expect(await screen.findByText("차단한 회원이 없습니다.")).toBeInTheDocument();
  });

  it("목록에서 확인 뒤 해제하면 안내와 함께 목록이 다시 읽힌다", async () => {
    let list = [blocked(7, "나그네"), blocked(8, "손님")];
    const backend = renderBlocks(() => list, { [UNBLOCK_7]: ok(null) });
    const rows = within(await screen.findByRole("list", { name: "차단한 회원" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("나그네");
    expect(rows[0]).toHaveTextContent("2026년 10월 7일 오전 9:00 차단");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const unblock = screen.getByRole("button", { name: "나그네 님 차단 해제" });
    fireEvent.click(unblock);
    expect(confirm).toHaveBeenCalledWith("나그네 님의 차단을 해제할까요?");
    expect(backend.callsTo(UNBLOCK_7)).toHaveLength(0);

    list = [blocked(8, "손님")];
    fireEvent.click(unblock);
    expect(await screen.findByRole("status")).toHaveTextContent("나그네 님의 차단을 해제했습니다.");
    expect(backend.callsTo(UNBLOCK_7)).toHaveLength(1);
    expect(screen.queryByText("나그네")).toBeNull();
  });

  it("해제에 실패하면 알림", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderBlocks(() => [blocked(7, "나그네")], { [UNBLOCK_7]: fail(500, "INTERNAL_ERROR") });
    fireEvent.click(await screen.findByRole("button", { name: "나그네 님 차단 해제" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
