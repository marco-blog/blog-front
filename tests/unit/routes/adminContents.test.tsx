// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  contentHref,
  contentQuery,
  isScopeRequired,
  needsScope,
  parseContentFilters,
} from "~/admin/contentSearch";
import type { AdminCommentRow, AdminGuestbookRow, AdminPostRow } from "~/api/models";
import { loader as redirectLoader } from "~/routes/admin/contents";
import { loader as hiddenPostsLoader } from "~/routes/admin/hidden-posts";
import Comments, {
  action as commentsAction,
  loader as commentsLoader,
} from "~/routes/admin/contents.comments";
import Guestbook, { loader as guestbookLoader } from "~/routes/admin/contents.guestbook";
import Posts, {
  action as postsAction,
  loader as postsLoader,
  meta,
} from "~/routes/admin/contents.posts";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
} from "../support/route";

type LoaderArgs = Parameters<typeof postsLoader>[0];
type ActionArgs = Parameters<typeof postsAction>[0];
const POSTS = "GET /api/v1/admin/contents/posts";
const COMMENTS = "GET /api/v1/admin/contents/comments";
const GUESTBOOK = "GET /api/v1/admin/contents/guestbook-entries";

const author = { userId: 9, nickname: "마르코", status: "ACTIVE" as const };
const postRow = (id: number, overrides: Partial<AdminPostRow> = {}): AdminPostRow => ({
  id,
  title: `글 ${id}`,
  blog: { handle: "marco", title: "마르코 블로그", status: "ACTIVE" },
  author,
  status: "PUBLISHED",
  visibility: "PUBLIC",
  publishedAt: "2026-10-01T01:00:00Z",
  createdAt: "2026-10-01T00:00:00Z",
  deletedAt: null,
  commentCount: 1234,
  ...overrides,
});
const commentRow = (id: number, overrides: Partial<AdminCommentRow> = {}): AdminCommentRow => ({
  id,
  postId: 3,
  postTitle: "자바 이야기",
  blogHandle: "marco",
  parentId: null,
  author,
  guestName: null,
  secret: false,
  content: "좋은 글",
  status: "ACTIVE",
  createdAt: "2026-10-02T00:00:00Z",
  ...overrides,
});

const call = (fn: (args: LoaderArgs) => unknown, path: string) =>
  fn(routeArgs<LoaderArgs>(getRequest(path, loggedIn)));

/** 콘텐츠 관리 검색 조건(006 T027) */
describe("contentSearch", () => {
  it("탭에 있는 조건만, 번호는 숫자만, 모르는 상태·공개 범위는 버린다", () => {
    const search = new URLSearchParams(
      "q=%20자바%20&handle=Marco&authorId=12&postId=3&status=HIDDEN&visibility=SECRET&page=2",
    );
    expect(parseContentFilters("posts", search)).toEqual({
      q: "자바",
      handle: "marco",
      authorId: "12",
      postId: "",
      status: "HIDDEN",
      visibility: "",
      page: 2,
    });
    expect(parseContentFilters("comments", search)).toMatchObject({ postId: "3", visibility: "" });
    expect(
      parseContentFilters("guestbook", new URLSearchParams("authorId=x&status=PUBLISHED&page=0")),
    ).toMatchObject({ authorId: "", status: "", page: 1 });
  });

  it("backend 쿼리·주소, 범위 확인", () => {
    const filters = parseContentFilters("comments", new URLSearchParams("q=좋은&handle=marco"));
    expect(contentQuery(filters)).toEqual({ q: "좋은", handle: "marco", page: 0, size: 20 });
    expect(contentHref("comments", filters, 3)).toBe(
      "/admin/contents/comments?q=%EC%A2%8B%EC%9D%80&handle=marco&page=3",
    );
    expect(contentHref("posts", parseContentFilters("posts", new URLSearchParams()))).toBe(
      "/admin/contents/posts",
    );
    expect(needsScope("comments", { ...filters, handle: "" })).toBe(true);
    expect(needsScope("comments", filters)).toBe(false);
    expect(needsScope("posts", { ...filters, handle: "" })).toBe(false);
    expect(
      isScopeRequired([{ field: "q", code: "INVALID", params: { reason: "SCOPE_REQUIRED" } }]),
    ).toBe(true);
    expect(isScopeRequired([{ field: "q", code: "TOO_SHORT" }])).toBe(false);
  });
});

describe("admin contents loader·action", () => {
  it("/admin/contents는 글 탭으로, 관리자가 아니면 404", async () => {
    mockBackend({ [ME]: ok(member()) });
    expect(expectRedirect(await call(redirectLoader as never, "/admin/contents"))).toBe(
      "/admin/contents/posts",
    );
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call(redirectLoader as never, "/admin/contents")))).toBe(404);
  });

  it("글: 조건을 그대로 backend 쿼리로(page 0부터)", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [POSTS]: ok([postRow(1)], { totalCount: 41 }),
    });

    await expect(
      call(
        postsLoader,
        "/admin/contents/posts?q=자바&handle=marco&authorId=9&status=DRAFT&visibility=PRIVATE&page=3",
      ),
    ).resolves.toMatchObject({
      rows: [postRow(1)],
      totalCount: 41,
      scopeRequired: false,
    });
    expect(Object.fromEntries(backend.callsTo(POSTS)[0].url.searchParams)).toEqual({
      q: "자바",
      handle: "marco",
      authorId: "9",
      status: "DRAFT",
      visibility: "PRIVATE",
      page: "2",
      size: "20",
    });
  });

  it("댓글: 범위 없는 내용 검색은 backend를 부르지 않고 안내, backend SCOPE_REQUIRED도 안내", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [COMMENTS]: fail(400, "VALIDATION_FAILED", [
        { field: "q", code: "INVALID", params: { reason: "SCOPE_REQUIRED" } },
      ]),
    });
    await expect(
      call(commentsLoader as never, "/admin/contents/comments?q=스팸"),
    ).resolves.toMatchObject({ rows: null, scopeRequired: true });
    expect(backend.callsTo(COMMENTS)).toHaveLength(0);

    // 번호가 숫자가 아니면 범위가 아니다
    await expect(
      call(commentsLoader as never, "/admin/contents/comments?q=스팸&postId=abc"),
    ).resolves.toMatchObject({ rows: null, scopeRequired: true });
    expect(backend.callsTo(COMMENTS)).toHaveLength(0);
    await expect(
      call(commentsLoader as never, "/admin/contents/comments?q=스팸&postId=3"),
    ).resolves.toMatchObject({ rows: null, scopeRequired: true });
    expect(backend.callsTo(COMMENTS)).toHaveLength(1);
  });

  it("400 입력 오류는 폼 문구로, 그 밖의 오류·관리자 아님은 오류 화면", async () => {
    mockBackend({
      [ME]: ok(member()),
      [POSTS]: fail(400, "VALIDATION_FAILED", [
        { field: "q", code: "TOO_SHORT", params: { min: 2 } },
      ]),
    });
    await expect(call(postsLoader, "/admin/contents/posts?q=a")).resolves.toMatchObject({
      rows: null,
      fieldErrors: [{ field: "q", code: "TOO_SHORT" }],
    });
    mockBackend({ [ME]: ok(member()), [POSTS]: fail(404, "NOT_FOUND") });
    expect(statusOf(await caught(call(postsLoader, "/admin/contents/posts")))).toBe(404);
    mockBackend({ [ME]: ok(member()), [POSTS]: fail(500, "INTERNAL_ERROR") });
    expect(statusOf(await caught(call(postsLoader, "/admin/contents/posts")))).toBe(500);
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("숨김 action: 사유 필수(500자) → 005 PUT { reason }, 해제는 DELETE, 오류는 폼 문구 (T039)", async () => {
    const HIDE = "PUT /api/v1/admin/contents/comments/5/hidden";
    const UNHIDE = "DELETE /api/v1/admin/contents/comments/5/hidden";
    const backend = mockBackend({ [ME]: ok(member()), [HIDE]: ok(null), [UNHIDE]: ok(null) });
    const post = (fields: Record<string, string>) =>
      commentsAction(
        routeArgs<ActionArgs>(formRequest("/admin/contents/comments", fields, loggedIn)) as never,
      );

    expect(asData(await post({ intent: "hide", id: "5", reason: " " })).data).toMatchObject({
      ok: false,
      fieldErrors: [{ field: "reason", code: "REQUIRED" }],
    });
    expect(
      asData(await post({ intent: "hide", id: "5", reason: "가".repeat(501) })).data,
    ).toMatchObject({ fieldErrors: [{ field: "reason", code: "TOO_LONG", params: { max: 500 } }] });
    expect(backend.callsTo(HIDE)).toHaveLength(0);

    expect(asData(await post({ intent: "hide", id: "5", reason: " 광고 " })).data).toEqual({
      intent: "hide",
      ok: true,
    });
    expect(backend.callsTo(HIDE).map((request) => request.body)).toEqual([{ reason: "광고" }]);
    expect(asData(await post({ intent: "unhide", id: "5" })).data).toEqual({
      intent: "unhide",
      ok: true,
    });
    expect(backend.callsTo(UNHIDE)).toHaveLength(1);
    expect(asData(await post({ intent: "hide", id: "x", reason: "a" })).init?.status).toBe(400);
    expect(asData(await post({ intent: "remove", id: "5" })).init?.status).toBe(400);

    mockBackend({ [ME]: ok(member()), [HIDE]: fail(404, "CONTENT_NOT_FOUND") });
    expect(asData(await post({ intent: "hide", id: "5", reason: "a" })).data).toMatchObject({
      ok: false,
      resultCode: "CONTENT_NOT_FOUND",
    });
  });

  it("숨긴 글 옛 주소(005)는 글 탭 숨김 목록으로, 관리자가 아니면 404 (T039)", async () => {
    mockBackend({ [ME]: ok(member()) });
    expect(
      expectRedirect(await call(hiddenPostsLoader as never, "/admin/contents/hidden-posts?page=2")),
    ).toBe("/admin/contents/posts?status=HIDDEN");
    mockBackend({ [ME]: ok(member("USER")) });
    expect(
      statusOf(await caught(call(hiddenPostsLoader as never, "/admin/contents/hidden-posts"))),
    ).toBe(404);
  });
});

describe("admin contents 화면", () => {
  function renderPosts(entry: string, rows: AdminPostRow[]) {
    mockBackend({ [ME]: ok(member()), [POSTS]: ok(rows, { totalCount: 45 }) });
    renderRoutes(
      [
        {
          path: "admin/contents/posts",
          loader: stub(postsLoader),
          action: stub(postsAction),
          Component: Posts,
        },
      ],
      { initialEntries: [entry] },
    );
  }

  it("탭 3개, 검색 폼 값, 글 표(글 주소·블로그·작성자 → 회원 상세·상태·공개 범위·댓글 수·숨김)", async () => {
    renderPosts("/admin/contents/posts?q=자바&status=DRAFT", [
      postRow(1),
      postRow(2, {
        title: "",
        status: "DRAFT",
        visibility: "PRIVATE",
        publishedAt: null,
        blog: { handle: "old", title: "옛 블로그", status: "DELETED" },
      }),
    ]);

    const tabs = await screen.findByRole("navigation", { name: "콘텐츠 종류" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/admin/contents/posts", "/admin/contents/comments", "/admin/contents/guestbook"]);
    const search = screen.getByRole("search", { name: "찾기" });
    expect(within(search).getByRole("searchbox", { name: "제목" })).toHaveValue("자바");
    expect(within(search).getByRole("combobox", { name: "상태" })).toHaveValue("DRAFT");
    expect(within(search).getByRole("combobox", { name: "공개 범위" })).toHaveValue("");
    const rows = within(screen.getByRole("table", { name: "콘텐츠 목록" })).getAllByRole("row");
    expect(within(rows[1]).getByRole("link", { name: "글 1" })).toHaveAttribute("href", "/marco/1");
    expect(within(rows[1]).getByRole("link", { name: "마르코" })).toHaveAttribute(
      "href",
      "/admin/users/9",
    );
    expect(rows[1]).toHaveTextContent("1,234");
    expect(rows[2]).toHaveTextContent("#2");
    expect(rows[2]).toHaveTextContent("삭제된 블로그");
    expect(rows[2]).toHaveTextContent("임시저장");
    expect(rows[2]).toHaveTextContent("발행 전");
    expect(within(rows[1]).getByRole("button", { name: "숨김: 글 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/admin/contents/posts?q=%EC%9E%90%EB%B0%94&status=DRAFT&page=2",
    );
  });

  it("행마다 숨김(사유 입력)·숨김 해제, 삭제된 글은 없음 (T039)", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [POSTS]: ok(
        [postRow(1), postRow(2, { status: "HIDDEN" }), postRow(3, { status: "DELETED" })],
        {
          totalCount: 3,
        },
      ),
      "PUT /api/v1/admin/contents/posts/1/hidden": ok(null),
    });
    renderRoutes(
      [
        {
          path: "admin/contents/posts",
          loader: stub(postsLoader),
          action: stub(postsAction),
          Component: Posts,
        },
      ],
      { initialEntries: ["/admin/contents/posts"] },
    );

    expect(await screen.findByRole("button", { name: "숨김 해제: 글 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /글 3/ })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "숨김 사유: 글 2" })).toBeNull();
    const reason = screen.getByRole("textbox", { name: "숨김 사유: 글 1" });
    expect(reason).toBeRequired();
    expect(reason).toHaveAttribute("maxlength", "500");
    fireEvent.change(reason, { target: { value: "광고" } });
    fireEvent.click(screen.getByRole("button", { name: "숨김: 글 1" }));
    expect(await screen.findByText("숨겼습니다.")).toBeInTheDocument();
    expect(backend.callsTo("PUT /api/v1/admin/contents/posts/1/hidden")[0].body).toEqual({
      reason: "광고",
    });
  });

  it("댓글: 원래 자리 앵커, 비밀 댓글, 비회원 이름, 범위 안내", async () => {
    mockBackend({
      [ME]: ok(member()),
      [COMMENTS]: ok(
        [
          commentRow(11),
          commentRow(12, {
            secret: true,
            content: null,
            author: null,
            guestName: "손님",
            status: "HIDDEN",
          }),
        ],
        { totalCount: 2 },
      ),
    });
    renderRoutes(
      [{ path: "admin/contents/comments", loader: stub(commentsLoader), Component: Comments }],
      { initialEntries: ["/admin/contents/comments?handle=marco&status=HIDDEN"] },
    );

    const table = await screen.findByRole("table", { name: "콘텐츠 목록" });
    expect(within(table).getByRole("link", { name: "좋은 글" })).toHaveAttribute(
      "href",
      "/marco/3#comment-11",
    );
    expect(within(table).getByRole("link", { name: "비밀 댓글" })).toHaveAttribute(
      "href",
      "/marco/3#comment-12",
    );
    expect(table).toHaveTextContent("비회원 손님");
    expect(table).toHaveTextContent("자바 이야기");
    expect(within(table).getAllByRole("row")[2]).toHaveTextContent("숨김");
    expect(screen.getByRole("combobox", { name: "상태" })).toHaveValue("HIDDEN");
    expect(screen.getByText(/내용 검색은 블로그·글·작성자 중 하나를/)).toBeInTheDocument();
  });

  it("댓글: 범위 없이 내용만 넣으면 안내하고 표가 없다", async () => {
    mockBackend({ [ME]: ok(member()) });
    renderRoutes(
      [{ path: "admin/contents/comments", loader: stub(commentsLoader), Component: Comments }],
      { initialEntries: ["/admin/contents/comments?q=스팸"] },
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "블로그·글·작성자 중 하나를 먼저 정하세요.",
    );
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("방명록: 원래 자리 앵커와 블로그, 빈 결과 안내, 입력 오류 문구", async () => {
    const guest: AdminGuestbookRow = {
      id: 21,
      blogHandle: "marco",
      parentId: null,
      author: null,
      guestName: "방문객",
      secret: false,
      content: "다녀갑니다",
      status: "ACTIVE",
      createdAt: "2026-10-02T00:00:00Z",
    };
    mockBackend({ [ME]: ok(member()), [GUESTBOOK]: ok([guest], { totalCount: 1 }) });
    const { unmount } = renderRoutes(
      [{ path: "admin/contents/guestbook", loader: stub(guestbookLoader), Component: Guestbook }],
      { initialEntries: ["/admin/contents/guestbook?handle=marco"] },
    );
    expect(await screen.findByRole("link", { name: "다녀갑니다" })).toHaveAttribute(
      "href",
      "/marco/guestbook#guestbook-21",
    );
    unmount();

    mockBackend({ [ME]: ok(member()), [GUESTBOOK]: ok([], { totalCount: 0 }) });
    const second = renderRoutes(
      [{ path: "admin/contents/guestbook", loader: stub(guestbookLoader), Component: Guestbook }],
      { initialEntries: ["/admin/contents/guestbook?authorId=9"] },
    );
    expect(await screen.findByText("조건에 맞는 콘텐츠가 없습니다.")).toBeInTheDocument();
    second.unmount();

    mockBackend({
      [ME]: ok(member()),
      [GUESTBOOK]: fail(400, "VALIDATION_FAILED", [
        { field: "q", code: "TOO_SHORT", params: { min: 2 } },
      ]),
    });
    renderRoutes(
      [{ path: "admin/contents/guestbook", loader: stub(guestbookLoader), Component: Guestbook }],
      { initialEntries: ["/admin/contents/guestbook?handle=marco&q=a"] },
    );
    expect(await screen.findByText(/2자 이상/)).toBeInTheDocument();
  });
});
