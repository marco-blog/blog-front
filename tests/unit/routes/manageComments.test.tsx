// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ManageComment } from "~/api/models";
import Comments, {
  action as commentsAction,
  loader as commentsLoader,
  meta as commentsMeta,
  parsePage,
} from "~/routes/manage/comments";
import Dashboard, { loader as dashboardLoader } from "~/routes/manage/dashboard";
import Layout, { loader as layoutLoader } from "~/routes/manage/layout";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
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

const ME = "GET /api/v1/me";
const COMMENTS = "GET /api/v1/blogs/marco/manage/comments";
const DASHBOARD = "GET /api/v1/blogs/marco/manage/dashboard";
const loggedIn = { cookie: "access_token=a" };

const me = (handles = ["marco"]) => ({
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: handles.map((handle) => ({ handle, title: `${handle} 블로그` })),
  unseenReleaseNote: null,
});

const managed = (id: number, overrides: Partial<ManageComment> = {}): ManageComment => ({
  id,
  content: `댓글 ${id}`,
  author: { userId: 9, nickname: "방문객", profileImageUrl: null },
  deleted: false,
  createdAt: "2026-10-06T04:24:19Z",
  updatedAt: "2026-10-06T04:24:19Z",
  postId: 3,
  postTitle: "발행한 글",
  ...overrides,
});

type LoaderArgs<F extends (...args: never[]) => unknown> = Parameters<F>[0];
const stub = (fn: unknown) => withCookie(fn as (args: { request: Request }) => unknown) as never;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("댓글 관리 loader·action", () => {
  const load = (path: string, handle = "marco") =>
    commentsLoader(
      routeArgs<LoaderArgs<typeof commentsLoader>>(getRequest(path, loggedIn), { handle }),
    );

  it("페이지(1부터)를 backend page(0부터)·size 20으로 바꿔 부른다", async () => {
    const backend = mockBackend({
      [ME]: ok(me()),
      [COMMENTS]: ok([managed(1)], { totalCount: 41 }),
    });

    const result = await load("/marco/manage/comments?page=3");

    expect(result).toMatchObject({ handle: "marco", page: 3, totalCount: 41 });
    expect(result.comments).toEqual([managed(1)]);
    const query = backend.callsTo(COMMENTS)[0].url.searchParams;
    expect(query.get("page")).toBe("2");
    expect(query.get("size")).toBe("20");
  });

  it("page 값이 이상하면 첫 페이지", () => {
    for (const value of ["0", "-1", "abc", "9999999"]) {
      expect(parsePage(new URLSearchParams({ page: value }))).toBe(1);
    }
    expect(parsePage(new URLSearchParams())).toBe(1);
  });

  it("남의 블로그는 404, backend 403도 404", async () => {
    mockBackend({ [ME]: ok(me()), [COMMENTS]: fail(403, "FORBIDDEN") });

    expect(statusOf(await caught(load("/other/manage/comments", "other")))).toBe(404);
    expect(statusOf(await caught(load("/marco/manage/comments")))).toBe(404);
  });

  it("지우기는 DELETE /comments/{id}(글 주인 권한), 쓰기는 받지 않는다", async () => {
    const backend = mockBackend({ [ME]: ok(me()), "DELETE /api/v1/comments/5": ok(null) });
    const call = (fields: Record<string, string>) =>
      commentsAction(
        routeArgs<Parameters<typeof commentsAction>[0]>(
          formRequest("/marco/manage/comments", fields, loggedIn),
          { handle: "marco" },
        ),
      );

    expect(
      asData(await call({ intent: "delete", target: "delete-5", commentId: "5" })).data,
    ).toEqual({ intent: "delete", target: "delete-5", ok: true });
    expect(backend.callsTo("DELETE /api/v1/comments/5")).toHaveLength(1);
    expect(asData(await call({ intent: "create", target: "new", content: "x" })).init?.status).toBe(
      400,
    );
  });

  it("meta는 noindex", () => {
    const tags = commentsMeta({
      matches: [{ id: "root", loaderData: rootData("ko") }],
    } as unknown as Parameters<typeof commentsMeta>[0]);
    expect(tags).toEqual([{ title: "댓글 관리 - 블로그" }, { name: "robots", content: "noindex" }]);
  });
});

describe("댓글 관리 화면", () => {
  function renderManage(path: string, routes: Record<string, BackendHandler | Response>) {
    const backend = mockBackend({ [ME]: ok(me()), ...routes });
    renderRoutes(
      [
        {
          path: ":handle/manage",
          loader: stub(layoutLoader),
          Component: Layout,
          children: [
            { index: true, loader: stub(dashboardLoader), Component: Dashboard },
            {
              path: "comments",
              loader: stub(commentsLoader),
              action: stub(commentsAction),
              Component: Comments,
            },
          ],
        },
      ],
      { initialEntries: [path] },
    );
    return backend;
  }

  it("메뉴에 댓글이 있고, 목록은 내용·작성자·글 링크·시각, 페이지 이동", async () => {
    renderManage("/marco/manage/comments", {
      [COMMENTS]: ok(
        [
          managed(1),
          managed(2, { content: "<b>굵게</b>", author: null, postId: 4, postTitle: "둘째 글" }),
        ],
        { totalCount: 21 },
      ),
    });

    const menu = await screen.findByRole("navigation", { name: "블로그 관리 메뉴" });
    expect(within(menu).getByRole("link", { name: "댓글" })).toHaveAttribute(
      "href",
      "/marco/manage/comments",
    );
    expect(await screen.findByRole("heading", { name: "댓글 관리" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "댓글 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("댓글 1")).toBeInTheDocument();
    expect(within(list).getByText("<b>굵게</b>")).toBeInTheDocument();
    expect(list.querySelector("b")).toBeNull();
    expect(within(list).getByText("알 수 없는 작성자")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "둘째 글에 남긴 댓글" })).toHaveAttribute(
      "href",
      "/marco/4#comment-2",
    );
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/marco/manage/comments?page=2",
    );
  });

  it("빈 목록 안내", async () => {
    renderManage("/marco/manage/comments", { [COMMENTS]: ok([], { totalCount: 0 }) });

    expect(await screen.findByText("아직 댓글이 없습니다.")).toBeInTheDocument();
  });

  it("삭제: 확인 후 지우고 다시 읽은 목록과 결과 안내, 실패는 오류 문구", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    let deleted = false;
    const backend = renderManage("/marco/manage/comments", {
      [COMMENTS]: () =>
        ok(deleted ? [] : [managed(1), managed(2)], { totalCount: deleted ? 0 : 2 }),
      "DELETE /api/v1/comments/1": () => {
        deleted = true;
        return ok(null);
      },
      "DELETE /api/v1/comments/2": fail(404, "COMMENT_NOT_FOUND"),
    });

    const list = await screen.findByRole("list", { name: "댓글 목록" });
    fireEvent.click(within(list).getAllByRole("button", { name: "삭제" })[1]);
    expect(await screen.findByRole("alert")).toHaveTextContent("댓글을 찾을 수 없습니다.");

    fireEvent.click(within(list).getAllByRole("button", { name: "삭제" })[0]);
    expect(await screen.findByRole("status")).toHaveTextContent("댓글을 삭제했습니다.");
    expect(await screen.findByText("아직 댓글이 없습니다.")).toBeInTheDocument();
    expect(backend.callsTo("DELETE /api/v1/comments/1")).toHaveLength(1);
    expect(window.confirm).toHaveBeenCalledWith("이 댓글을 삭제할까요?");
  });

  it("대시보드 댓글 수치: 최근 7일 새 댓글 수와 최근 댓글, 모두 보기 링크", async () => {
    renderManage("/marco/manage", {
      [DASHBOARD]: ok({
        draftCount: 0,
        recentPosts: [],
        newComments7d: 4,
        recentComments: [managed(1, { content: "새로 달린 댓글" })],
      }),
    });

    expect(await screen.findByText("4개")).toBeInTheDocument();
    expect(screen.getByText("새로 달린 댓글")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "댓글 모두 보기" })).toHaveAttribute(
      "href",
      "/marco/manage/comments",
    );
  });
});

describe("댓글 관리 — 비밀·비회원 표시와 회원 차단(004 US3·US5)", () => {
  function renderComments(routes: Record<string, BackendHandler | Response>) {
    const backend = mockBackend({ [ME]: ok(me()), ...routes });
    renderRoutes(
      [
        {
          path: ":handle/manage/comments",
          loader: stub(commentsLoader),
          action: stub(commentsAction),
          Component: Comments,
        },
      ],
      { initialEntries: ["/marco/manage/comments"] },
    );
    return backend;
  }

  it("회원 작성자에게만 차단 버튼(비회원·주인 자신·알 수 없음은 없음), 비밀·비회원 표시", async () => {
    renderComments({
      [COMMENTS]: ok([
        managed(1, { secret: true }),
        managed(2, {
          author: { userId: null, nickname: "나그네", profileImageUrl: null, guest: true },
        }),
        managed(3, { author: { userId: 7, nickname: "마르코", profileImageUrl: null } }),
        managed(4, { author: null }),
      ]),
    });
    const rows = within(await screen.findByRole("list", { name: "댓글 목록" })).getAllByRole(
      "listitem",
    );
    expect(within(rows[0]).getByRole("button", { name: "방문객 님 차단" })).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("비밀 댓글");
    expect(rows[1]).toHaveTextContent("비회원");
    for (const row of rows.slice(1)) {
      expect(within(row).queryByRole("button", { name: /차단/ })).toBeNull();
    }
  });

  it("확인하면 PUT /blogs/{handle}/blocks/{userId} 뒤 안내, 취소하면 보내지 않는다", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    const backend = renderComments({
      [COMMENTS]: ok([managed(1)]),
      "PUT /api/v1/blogs/marco/blocks/9": ok(null),
    });
    const button = await screen.findByRole("button", { name: "방문객 님 차단" });
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith(
      "방문객 님을 차단할까요? 이 블로그에 댓글·방명록을 쓰거나 구독할 수 없게 되고, 구독 중이면 구독이 풀립니다.",
    );
    expect(backend.callsTo("PUT /api/v1/blogs/marco/blocks/9")).toHaveLength(0);

    fireEvent.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent("방문객 님을 차단했습니다.");
    expect(backend.callsTo("PUT /api/v1/blogs/marco/blocks/9")).toHaveLength(1);
  });
});
