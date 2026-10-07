// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import type { PostSummary } from "~/api/models";
import { thumbnailImage } from "~/media/thumbnail";
import { loader as entryLoader } from "~/routes/manage-entry";
import Dashboard, {
  loader as dashboardLoader,
  meta as dashboardMeta,
} from "~/routes/manage/dashboard";
import Layout, {
  MANAGE_MENU,
  loader as layoutLoader,
  meta as layoutMeta,
} from "~/routes/manage/layout";
import Posts, {
  action as postsAction,
  filtersSearch,
  loader as postsLoader,
  meta as postsMeta,
  parseFilters,
} from "~/routes/manage/posts";
import Settings, {
  action as settingsAction,
  loader as settingsLoader,
  meta as settingsMeta,
} from "~/routes/manage/settings";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { blog, postSummary, topicNode } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
  withCookie,
} from "../support/route";

const ME = "GET /api/v1/me";
const DASHBOARD = "GET /api/v1/blogs/marco/manage/dashboard";
const POSTS = "GET /api/v1/blogs/marco/manage/posts";
const BULK = "POST /api/v1/blogs/marco/manage/posts/bulk";
const BLOG = "GET /api/v1/blogs/marco";
const loggedIn = { cookie: "access_token=a" };

const me = (handles = ["marco", "marco-dev"]) => ({
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

const dashboard = {
  draftCount: 2,
  recentPosts: [
    postSummary(3, { title: "발행한 글" }),
    postSummary(4, { title: "", status: "DRAFT", publishedAt: null, hasDraft: true }),
  ],
  newComments7d: 0,
  recentComments: [],
};

const trashed = (id: number, overrides: Partial<PostSummary> = {}) =>
  postSummary(id, {
    status: "DELETED",
    deletedAt: "2026-10-05T00:00:00Z",
    purgeAt: "2026-11-04T00:00:00Z",
    ...overrides,
  });

/** 라우트 스텁은 `:handle` params 타입을 모르므로 loader·action 타입을 넓힌다. */
const stub = (fn: unknown) => withCookie(fn as (args: { request: Request }) => unknown) as never;

type LoaderArgs<F extends (...args: never[]) => unknown> = Parameters<F>[0];

describe("/manage", () => {
  async function target(handles: string[], cookie = "access_token=a") {
    mockBackend({ [ME]: ok(me(handles)) });
    return expectRedirect(
      await caught(
        entryLoader(routeArgs<LoaderArgs<typeof entryLoader>>(getRequest("/manage", { cookie }))),
      ),
    );
  }

  it("블로그가 1개면 그 블로그의 관리로", async () => {
    expect(await target(["marco"], "access_token=a; last_blog=other")).toBe("/marco/manage");
  });

  it("여러 개면 last_blog가 내 블로그일 때 그 블로그로, 아니면 블로그 선택", async () => {
    expect(await target(["marco", "marco-dev"], "access_token=a; last_blog=marco-dev")).toBe(
      "/marco-dev/manage",
    );
    expect(await target(["marco", "marco-dev"], "access_token=a; last_blog=someone")).toBe(
      "/settings/blogs",
    );
  });

  it("비로그인은 /login?next=/manage", async () => {
    mockBackend({ [ME]: fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(
        entryLoader(
          routeArgs<LoaderArgs<typeof entryLoader>>(getRequest("/manage", { cookie: "lang=ko" })),
        ),
      ),
    );

    expect(location).toBe("/login?next=%2Fmanage");
  });
});

describe("/:handle/manage 레이아웃 loader", () => {
  const call = (path: string, handle: string, cookie = loggedIn) =>
    layoutLoader(routeArgs<LoaderArgs<typeof layoutLoader>>(getRequest(path, cookie), { handle }));

  it("내 블로그면 블로그 목록을 넘기고 last_blog 쿠키를 저장한다", async () => {
    mockBackend({ [ME]: ok(me()) });
    const request = getRequest("/marco-dev/manage/posts", loggedIn);

    const result = await layoutLoader(
      routeArgs<LoaderArgs<typeof layoutLoader>>(request, { handle: "marco-dev" }),
    );

    expect(result).toEqual({ handle: "marco-dev", blogs: me().blogs });
    expect(responseCookies(request)).toEqual([
      expect.stringMatching(/^last_blog=marco-dev; Path=\/; Max-Age=31536000; HttpOnly/),
    ]);
  });

  it("남의 블로그·삭제된 블로그(/me에 없음)는 404", async () => {
    mockBackend({ [ME]: ok(me(["marco"])) });

    expect(statusOf(await caught(call("/other/manage", "other")))).toBe(404);
    expect(statusOf(await caught(call("/marco-old/manage", "marco-old")))).toBe(404);
  });

  it("비로그인은 /login?next=…", async () => {
    mockBackend({ [ME]: fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(call("/marco/manage/posts?status=DELETED", "marco", { cookie: "x=1" })),
    );

    expect(new URL(location, "http://front.test").searchParams.get("next")).toBe(
      "/marco/manage/posts?status=DELETED",
    );
  });
});

describe("관리 화면 meta", () => {
  const args = (search = "") =>
    ({
      matches: [{ id: "root", loaderData: rootData("ko") }],
      location: { search },
    }) as never;

  it("모든 관리 화면은 noindex", () => {
    for (const meta of [layoutMeta, dashboardMeta, postsMeta, settingsMeta]) {
      expect(meta(args())).toContainEqual({ name: "robots", content: "noindex" });
    }
    expect(dashboardMeta(args())[0]).toEqual({ title: "대시보드 - 블로그" });
    expect(postsMeta(args())[0]).toEqual({ title: "글 관리 - 블로그" });
    expect(postsMeta(args("?status=DELETED"))[0]).toEqual({ title: "휴지통 - 블로그" });
    expect(settingsMeta(args())[0]).toEqual({ title: "블로그 설정 - 블로그" });
  });
});

describe("글 관리 조건", () => {
  it("주소의 조건을 읽고 모르는 값은 버린다", () => {
    expect(
      parseFilters(
        new URLSearchParams("status=DELETED&visibility=PRIVATE&category=12&q=%20스프링%20&page=3"),
      ),
    ).toEqual({ status: "DELETED", visibility: "PRIVATE", category: 12, q: "스프링", page: 3 });
    expect(
      parseFilters(new URLSearchParams("status=HIDDEN&visibility=x&category=-1&page=0")),
    ).toEqual({ status: null, visibility: null, category: null, q: "", page: 1 });
  });

  it("조건 → 쿼리 문자열(첫 페이지는 page 없음)", () => {
    const filters = parseFilters(new URLSearchParams("status=DRAFT&q=jpa"));
    expect(filtersSearch(filters)).toBe("?status=DRAFT&q=jpa");
    expect(filtersSearch(filters, 2)).toBe("?status=DRAFT&q=jpa&page=2");
    expect(filtersSearch(parseFilters(new URLSearchParams()))).toBe("");
  });

  it("loader는 조건을 backend 쿼리로(페이지는 0부터) 넘긴다", async () => {
    const backend = mockBackend({
      [ME]: ok(me()),
      [POSTS]: ok([postSummary(1)], { totalCount: 41 }),
      [BLOG]: ok({
        ...blog,
        categories: [
          {
            id: 12,
            name: "Spring",
            postCount: 1,
            children: [{ id: 13, name: "JPA", postCount: 1, children: [] }],
          },
        ],
      }),
    });

    const result = await postsLoader(
      routeArgs<LoaderArgs<typeof postsLoader>>(
        getRequest(
          "/marco/manage/posts?status=PUBLISHED&visibility=PUBLIC&category=13&q=jpa&page=2",
          loggedIn,
        ),
        { handle: "marco" },
      ),
    );

    const query = backend.callsTo(POSTS)[0].url.searchParams;
    expect(Object.fromEntries(query)).toEqual({
      status: "PUBLISHED",
      visibility: "PUBLIC",
      category: "13",
      q: "jpa",
      page: "1",
      size: "20",
    });
    expect(result.totalCount).toBe(41);
    expect(result.categories).toEqual([
      { id: 12, name: "Spring", depth: 0 },
      { id: 13, name: "JPA", depth: 1 },
    ]);
  });

  it("backend가 403이면 404로, 그 밖의 오류는 상태 코드 그대로", async () => {
    mockBackend({ [ME]: ok(me()), [POSTS]: fail(403, "FORBIDDEN"), [BLOG]: ok(blog) });
    const call = () =>
      postsLoader(
        routeArgs<LoaderArgs<typeof postsLoader>>(getRequest("/marco/manage/posts", loggedIn), {
          handle: "marco",
        }),
      );
    expect(statusOf(await caught(call()))).toBe(404);

    mockBackend({ [ME]: ok(me()), [DASHBOARD]: fail(500, "INTERNAL_ERROR") });
    expect(
      statusOf(
        await caught(
          dashboardLoader(
            routeArgs<LoaderArgs<typeof dashboardLoader>>(getRequest("/marco/manage", loggedIn), {
              handle: "marco",
            }),
          ),
        ),
      ),
    ).toBe(500);
  });
});

describe("글 관리 action", () => {
  const call = (fields: Record<string, string | string[]>) => {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
    }
    const request = new Request("http://front.test/marco/manage/posts", {
      method: "POST",
      body,
      headers: { origin: "http://front.test", ...loggedIn },
    });
    return postsAction(routeArgs<LoaderArgs<typeof postsAction>>(request, { handle: "marco" }));
  };

  it("선택한 글을 비공개로: CHANGE_VISIBILITY, 같은 글은 한 번만", async () => {
    const backend = mockBackend({ [ME]: ok(me()), [BULK]: ok({ updated: 3 }) });

    const result = asData(
      await call({ intent: "bulk", op: "PRIVATE", postIds: ["1", "2", "3", "2", "x"] }),
    );

    expect(result.data).toEqual({ intent: "bulk", ok: true, updated: 3 });
    expect(backend.callsTo(BULK)[0].body).toEqual({
      postIds: [1, 2, 3],
      action: "CHANGE_VISIBILITY",
      visibility: "PRIVATE",
    });
  });

  it("휴지통으로: DELETE", async () => {
    const backend = mockBackend({ [ME]: ok(me()), [BULK]: ok({ updated: 1 }) });

    await call({ intent: "bulk", op: "DELETE", postIds: "9" });

    expect(backend.callsTo(BULK)[0].body).toEqual({ postIds: [9], action: "DELETE" });
  });

  it("공지로·공지 해제: NOTICE·UNNOTICE(004)", async () => {
    const backend = mockBackend({ [ME]: ok(me()), [BULK]: ok({ updated: 2 }) });

    const result = asData(await call({ intent: "bulk", op: "NOTICE", postIds: ["1", "2"] }));
    await call({ intent: "bulk", op: "UNNOTICE", postIds: "3" });

    expect(result.data).toEqual({ intent: "bulk", ok: true, updated: 2 });
    expect(backend.callsTo(BULK).map((c) => c.body)).toEqual([
      { postIds: [1, 2], action: "NOTICE" },
      { postIds: [3], action: "UNNOTICE" },
    ]);
  });

  it("카테고리 옮기기: MOVE_CATEGORY, 대상이 비면 미분류(null)", async () => {
    const backend = mockBackend({ [ME]: ok(me()), [BULK]: ok({ updated: 2 }) });

    await call({ intent: "bulk", op: "MOVE", postIds: ["1", "2"], moveCategoryId: "12" });
    await call({ intent: "bulk", op: "MOVE", postIds: "3", moveCategoryId: "" });

    expect(backend.callsTo(BULK).map((c) => c.body)).toEqual([
      { postIds: [1, 2], action: "MOVE_CATEGORY", categoryId: 12 },
      { postIds: [3], action: "MOVE_CATEGORY", categoryId: null },
    ]);
  });

  it("고른 글이 없거나 모르는 작업이면 backend를 부르지 않는다", async () => {
    const backend = mockBackend({ [ME]: ok(me()) });

    const none = asData(await call({ intent: "bulk", op: "PUBLIC" }));
    expect(none.data).toEqual({ intent: "bulk", ok: false, noSelection: true });
    expect(none.init?.status).toBe(400);
    expect(asData(await call({ intent: "bulk", op: "RENAME", postIds: "1" })).init?.status).toBe(
      400,
    );
    expect(asData(await call({ intent: "restore", postId: "abc" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "nope" })).init?.status).toBe(400);
    expect(new Set(backend.calls.map((c) => c.path))).toEqual(new Set(["/api/v1/me"]));
  });

  it("남의 글이 섞이면 FORBIDDEN", async () => {
    mockBackend({ [ME]: ok(me()), [BULK]: fail(403, "FORBIDDEN") });

    const result = asData(await call({ intent: "bulk", op: "DELETE", postIds: ["1", "99"] }));

    expect(result.init?.status).toBe(403);
    expect(result.data).toMatchObject({ intent: "bulk", ok: false, resultCode: "FORBIDDEN" });
  });

  it("복구: POST /posts/{id}/restore, 실패하면 오류 코드", async () => {
    const backend = mockBackend({
      [ME]: ok(me()),
      "POST /api/v1/posts/5/restore": ok(postSummary(5)),
      "POST /api/v1/posts/6/restore": fail(422, "POST_NOT_IN_TRASH"),
    });

    expect(asData(await call({ intent: "restore", postId: "5" })).data).toEqual({
      intent: "restore",
      ok: true,
    });
    expect(backend.callsTo("POST /api/v1/posts/5/restore")).toHaveLength(1);
    expect(asData(await call({ intent: "restore", postId: "6" })).data).toMatchObject({
      ok: false,
      resultCode: "POST_NOT_IN_TRASH",
    });
  });
});

const TOPICS = "GET /api/v1/topics";
const topics = [topicNode(1, "dev", {}, [topicNode(11, "java", { parentId: 1 })])];

describe("블로그 설정 loader·action", () => {
  it("loader는 블로그의 제목·소개·댓글 허용·포털 노출·기본 주제와 주제 트리", async () => {
    mockBackend({
      [ME]: ok(me()),
      [BLOG]: ok({ ...blog, portalEnabled: false, defaultTopicId: 11 }),
      [TOPICS]: ok(topics),
    });

    await expect(
      settingsLoader(
        routeArgs<LoaderArgs<typeof settingsLoader>>(
          getRequest("/marco/manage/settings", loggedIn),
          {
            handle: "marco",
          },
        ),
      ),
    ).resolves.toEqual({
      blog: {
        handle: "marco",
        title: blog.title,
        description: blog.description,
        coverImageUrl: blog.coverImageUrl,
        commentEnabled: true,
        portalEnabled: false,
        defaultTopicId: 11,
        guestbookEnabled: true,
        guestWriteEnabled: false,
      },
      topics,
    });
  });

  it("loader: 방명록 사용·비회원 허용 값을 그대로 넘긴다(004)", async () => {
    mockBackend({
      [ME]: ok(me()),
      [BLOG]: ok({ ...blog, guestbookEnabled: false, guestWriteEnabled: true }),
      [TOPICS]: ok([]),
    });

    await expect(
      settingsLoader(
        routeArgs<LoaderArgs<typeof settingsLoader>>(
          getRequest("/marco/manage/settings", loggedIn),
          { handle: "marco" },
        ),
      ),
    ).resolves.toMatchObject({ blog: { guestbookEnabled: false, guestWriteEnabled: true } });
  });

  it("action: 방명록 사용·비회원 허용 체크를 { guestbookEnabled, guestWriteEnabled }로 보낸다(004)", async () => {
    const backend = mockBackend({ [ME]: ok(me()), "PATCH /api/v1/blogs/marco": ok(blog) });
    const submit = (fields: Record<string, string>) =>
      settingsAction(
        routeArgs<LoaderArgs<typeof settingsAction>>(
          formRequest("/marco/manage/settings", { title: "제목", ...fields }, loggedIn),
          { handle: "marco" },
        ),
      );

    await submit({ guestbookEnabled: "on", guestWriteEnabled: "on" });
    await submit({ guestbookEnabled: "on" });

    const bodies = backend.callsTo("PATCH /api/v1/blogs/marco").map((call) => call.body);
    expect(bodies[0]).toMatchObject({ guestbookEnabled: true, guestWriteEnabled: true });
    expect(bodies[1]).toMatchObject({ guestbookEnabled: true, guestWriteEnabled: false });
  });

  it("loader: 주제 트리를 못 읽으면 빈 목록, 포털 값이 없으면 노출·기본 주제 없음", async () => {
    mockBackend({ [ME]: ok(me()), [BLOG]: ok(blog), [TOPICS]: fail(500, "INTERNAL_ERROR") });

    await expect(
      settingsLoader(
        routeArgs<LoaderArgs<typeof settingsLoader>>(
          getRequest("/marco/manage/settings", loggedIn),
          { handle: "marco" },
        ),
      ),
    ).resolves.toMatchObject({ topics: [], blog: { portalEnabled: true, defaultTopicId: null } });
  });

  it("action: PATCH /blogs/{handle}, 소개를 비우면 null, 체크 해제는 false", async () => {
    const backend = mockBackend({ [ME]: ok(me()), "PATCH /api/v1/blogs/marco": ok(blog) });

    const result = asData(
      await settingsAction(
        routeArgs<LoaderArgs<typeof settingsAction>>(
          formRequest(
            "/marco/manage/settings",
            { title: " 새 제목 ", description: "  " },
            loggedIn,
          ),
          { handle: "marco" },
        ),
      ),
    );

    expect(result.data).toEqual({ ok: true });
    expect(backend.callsTo("PATCH /api/v1/blogs/marco")[0].body).toEqual({
      title: "새 제목",
      description: null,
      commentEnabled: false,
      portalEnabled: false,
      guestbookEnabled: false,
      guestWriteEnabled: false,
      defaultTopicId: null,
    });
  });

  it("action: 포털 노출 체크와 기본 주제 번호를 보낸다(숫자가 아니면 null)", async () => {
    const backend = mockBackend({ [ME]: ok(me()), "PATCH /api/v1/blogs/marco": ok(blog) });
    const submit = (fields: Record<string, string>) =>
      settingsAction(
        routeArgs<LoaderArgs<typeof settingsAction>>(
          formRequest("/marco/manage/settings", { title: "제목", ...fields }, loggedIn),
          { handle: "marco" },
        ),
      );

    await submit({ portalEnabled: "on", defaultTopicId: "11" });
    await submit({ defaultTopicId: "abc" });

    const bodies = backend.callsTo("PATCH /api/v1/blogs/marco").map((call) => call.body);
    expect(bodies[0]).toMatchObject({ portalEnabled: true, defaultTopicId: 11 });
    expect(bodies[1]).toMatchObject({ portalEnabled: false, defaultTopicId: null });
  });

  it("action: 대표 이미지는 바꿨을 때만 coverImageMediaKey로 보낸다(지우면 null)", async () => {
    const backend = mockBackend({ [ME]: ok(me()), "PATCH /api/v1/blogs/marco": ok(blog) });
    const submit = (fields: Record<string, string>) =>
      settingsAction(
        routeArgs<LoaderArgs<typeof settingsAction>>(
          formRequest("/marco/manage/settings", { title: "제목", ...fields }, loggedIn),
          { handle: "marco" },
        ),
      );

    await submit({ coverImageMediaKey: "k3Jd9fQ2xLmA7pZ0bR5tYw" });
    await submit({ coverImageMediaKey: "" });

    const bodies = backend.callsTo("PATCH /api/v1/blogs/marco").map((call) => call.body);
    expect(bodies[0]).toMatchObject({ coverImageMediaKey: "k3Jd9fQ2xLmA7pZ0bR5tYw" });
    expect(bodies[1]).toMatchObject({ coverImageMediaKey: null });
  });

  it("제목이 비면 backend를 부르지 않고 REQUIRED", async () => {
    const backend = mockBackend({ [ME]: ok(me()) });

    const result = asData(
      await settingsAction(
        routeArgs<LoaderArgs<typeof settingsAction>>(
          formRequest("/marco/manage/settings", { title: " ", commentEnabled: "on" }, loggedIn),
          { handle: "marco" },
        ),
      ),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({ fieldErrors: [{ field: "title", code: "REQUIRED" }] });
    expect(backend.calls.map((c) => c.path)).toEqual(["/api/v1/me"]);
  });

  it("남의 블로그는 action도 404", async () => {
    mockBackend({ [ME]: ok(me(["marco"])) });

    expect(
      statusOf(
        await caught(
          settingsAction(
            routeArgs<LoaderArgs<typeof settingsAction>>(
              formRequest("/other/manage/settings", { title: "x" }, loggedIn),
              { handle: "other" },
            ),
          ),
        ),
      ),
    ).toBe(404);
  });
});

describe("블로그 관리 화면", () => {
  function renderManage(
    path: string,
    routes: Record<string, BackendHandler | Response>,
    handles = ["marco", "marco-dev"],
  ) {
    const backend = mockBackend({ [ME]: ok(me(handles)), [BLOG]: ok(blog), ...routes });
    renderRoutes(
      [
        {
          path: ":handle/manage",
          loader: stub(layoutLoader),
          Component: Layout,
          children: [
            { index: true, loader: stub(dashboardLoader), Component: Dashboard },
            {
              path: "posts",
              loader: stub(postsLoader),
              action: stub(postsAction),
              Component: Posts,
            },
            {
              path: "settings",
              loader: stub(settingsLoader),
              action: stub(settingsAction),
              Component: Settings,
            },
          ],
        },
      ],
      { initialEntries: [path] },
    );
    return backend;
  }

  it("레이아웃: 001 메뉴와 002 피드 설정(T089), 블로그 전환은 다른 블로그의 같은 메뉴로", async () => {
    renderManage("/marco/manage/posts", { [POSTS]: ok([], { totalCount: 0 }) });

    const menu = await screen.findByRole("navigation", { name: "블로그 관리 메뉴" });
    expect(
      within(menu)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "대시보드",
      "글 관리",
      "카테고리",
      "댓글",
      "방명록",
      "꾸미기",
      "통계",
      "블로그 설정",
      "피드 설정",
    ]);
    expect(within(menu).getByRole("link", { name: "카테고리" })).toHaveAttribute(
      "href",
      "/marco/manage/categories",
    );
    expect(within(menu).getByRole("link", { name: "글 관리" })).toHaveAttribute(
      "href",
      "/marco/manage/posts",
    );
    expect(MANAGE_MENU.map((item) => item.key)).toEqual([
      "dashboard",
      "posts",
      "categories",
      "comments",
      "guestbook",
      "design",
      "stats",
      "settings",
      "feed",
    ]);
    expect(within(menu).getByRole("link", { name: "피드 설정" })).toHaveAttribute(
      "href",
      "/marco/manage/feed",
    );
    const switcher = screen.getByRole("navigation", { name: "블로그 전환" });
    expect(within(switcher).getByRole("link", { name: "marco-dev 블로그" })).toHaveAttribute(
      "href",
      "/marco-dev/manage/posts",
    );
    expect(within(switcher).getByText("marco 블로그")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "블로그 보기" })).toHaveAttribute("href", "/marco");
  });

  it("블로그가 하나면 전환 메뉴가 없다", async () => {
    renderManage("/marco/manage/settings", {}, ["marco"]);

    expect(await screen.findByRole("heading", { name: "블로그 설정" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "블로그 전환" })).toBeNull();
  });

  it("대시보드: 임시저장 수, 최근 글, 최근 댓글(방문자 수 없음)", async () => {
    renderManage("/marco/manage", { [DASHBOARD]: ok(dashboard) });

    expect(await screen.findByRole("heading", { name: "대시보드" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2편" })).toHaveAttribute(
      "href",
      "/marco/manage/posts?status=DRAFT",
    );
    expect(screen.getByText("0개")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "발행한 글" })).toHaveAttribute("href", "/marco/3");
    expect(screen.getByRole("link", { name: "(제목 없음)" })).toHaveAttribute(
      "href",
      "/marco/write/4",
    );
    expect(screen.getByText("아직 댓글이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(/방문자/)).toBeNull();
  });

  it("대시보드: 최근 글·댓글이 있으면 목록으로", async () => {
    renderManage("/marco/manage", {
      [DASHBOARD]: ok({
        ...dashboard,
        recentPosts: [],
        newComments7d: 2,
        recentComments: [
          {
            id: 1,
            content: "좋은 글이네요",
            author: { userId: 9, nickname: "방문객", profileImageUrl: null },
            deleted: false,
            createdAt: "2026-10-06T04:24:19Z",
            updatedAt: "2026-10-06T04:24:19Z",
            postId: 3,
            postTitle: "발행한 글",
          },
          {
            id: 2,
            content: null,
            author: { userId: 9, nickname: "방문객", profileImageUrl: null },
            deleted: true,
            createdAt: "2026-10-06T04:24:19Z",
            updatedAt: "2026-10-06T04:24:19Z",
            postId: 3,
            postTitle: "발행한 글",
          },
        ],
      }),
    });

    expect(await screen.findByText("좋은 글이네요")).toBeInTheDocument();
    expect(screen.getByText("삭제된 댓글")).toBeInTheDocument();
    expect(screen.getByText("2개")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "발행한 글에 남긴 댓글" })[0]).toHaveAttribute(
      "href",
      "/marco/3#comment-1",
    );
    expect(screen.getByRole("link", { name: "댓글 모두 보기" })).toHaveAttribute(
      "href",
      "/marco/manage/comments",
    );
    expect(screen.getByText("아직 글이 없습니다.")).toBeInTheDocument();
  });

  it("글 관리: 공지 글 표시와 일괄 공지로·공지 해제 버튼(004)", async () => {
    const backend = renderManage("/marco/manage/posts", {
      [POSTS]: ok([postSummary(1, { title: "공지 글", notice: true }), postSummary(2)], {
        totalCount: 2,
      }),
      [BULK]: ok({ updated: 1 }),
    });

    const list = await screen.findByRole("list", { name: "글 목록" });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[0]).getByText("공지", { selector: ".badge" })).toBeInTheDocument();
    expect(within(items[1]).queryByText("공지", { selector: ".badge" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "글 2 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "공지로" }));
    expect(await screen.findByRole("status")).toHaveTextContent("글 1편을 바꿨습니다.");
    expect(backend.callsTo(BULK)[0].body).toEqual({ postIds: [2], action: "NOTICE" });
    expect(screen.getByRole("button", { name: "공지 해제" })).toBeInTheDocument();
  });

  it("글 관리: 상태·공개 범위·작성 중 사본, 수정·이어 쓰기 링크, 필터 폼은 쿼리 문자열로", async () => {
    renderManage("/marco/manage/posts?visibility=PRIVATE", {
      [POSTS]: ok(
        [
          postSummary(1, { title: "발행 글", visibility: "PRIVATE" }),
          postSummary(2, { title: "고치는 글", hasDraft: true }),
          postSummary(3, { title: "임시 글", status: "DRAFT", publishedAt: null, hasDraft: true }),
        ],
        { totalCount: 45 },
      ),
    });

    const list = await screen.findByRole("list", { name: "글 목록" });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[0]).getByRole("link", { name: "발행 글" })).toHaveAttribute(
      "href",
      "/marco/1",
    );
    expect(within(items[0]).getByRole("link", { name: "수정" })).toHaveAttribute(
      "href",
      "/marco/write/1",
    );
    expect(items[0]).toHaveTextContent("비공개");
    expect(items[1]).toHaveTextContent("작성 중인 수정본 있음");
    expect(within(items[1]).getByRole("link", { name: "이어 쓰기" })).toHaveAttribute(
      "href",
      "/marco/write/2",
    );
    expect(within(items[2]).getByRole("link", { name: "임시 글" })).toHaveAttribute(
      "href",
      "/marco/write/3",
    );
    expect(items[2]).toHaveTextContent("임시저장");

    const search = screen.getByRole("search", { name: "글 찾기" });
    expect(search).toHaveAttribute("method", "get");
    expect(within(search).getByLabelText("공개 범위")).toHaveValue("PRIVATE");
    expect(within(search).getByLabelText("상태")).toHaveValue("");
    expect(within(search).getByLabelText("카테고리")).toHaveTextContent("Spring");
    expect(within(search).getByLabelText("제목 검색")).toHaveAttribute("name", "q");

    const pages = screen.getByRole("navigation", { name: "페이지" });
    expect(within(pages).getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/marco/manage/posts?visibility=PRIVATE&page=2",
    );
  });

  it("글 관리: 세 편을 골라 비공개로 바꾸면 안내하고 목록을 다시 읽는다", async () => {
    let visibility: "PUBLIC" | "PRIVATE" = "PUBLIC";
    const backend = renderManage("/marco/manage/posts", {
      [POSTS]: () =>
        ok([1, 2, 3, 4].map((id) => postSummary(id, { title: `글 ${id}`, visibility }))),
      [BULK]: () => {
        visibility = "PRIVATE";
        return ok({ updated: 3 });
      },
    });

    for (const id of [1, 2, 3]) {
      fireEvent.click(await screen.findByLabelText(`글 ${id} 선택`));
    }
    fireEvent.click(screen.getByRole("button", { name: "비공개로 바꾸기" }));

    expect(await screen.findByRole("status")).toHaveTextContent("글 3편을 바꿨습니다.");
    expect(backend.callsTo(BULK)[0].body).toEqual({
      postIds: [1, 2, 3],
      action: "CHANGE_VISIBILITY",
      visibility: "PRIVATE",
    });
    expect(backend.callsTo(POSTS).length).toBeGreaterThanOrEqual(2);
  });

  it("글 관리: 모두 선택, 아무것도 고르지 않으면 안내, 남의 글이면 오류 문구", async () => {
    renderManage("/marco/manage/posts", {
      [POSTS]: ok([postSummary(1), postSummary(2)]),
      [BULK]: fail(403, "FORBIDDEN"),
    });

    fireEvent.click(await screen.findByRole("button", { name: "휴지통으로 옮기기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("글을 먼저 고르세요.");

    const all = screen.getByLabelText("모두 선택");
    fireEvent.click(all);
    expect(screen.getByLabelText("글 1 선택")).toBeChecked();
    expect(screen.getByLabelText("글 2 선택")).toBeChecked();
    fireEvent.click(screen.getByLabelText("글 2 선택"));
    expect(all).not.toBeChecked();
    fireEvent.click(all);
    fireEvent.click(all);
    expect(screen.getByLabelText("글 1 선택")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("글 1 선택"));
    fireEvent.click(screen.getByRole("button", { name: "공개로 바꾸기" }));

    expect(await screen.findByText("이 작업을 할 권한이 없습니다.")).toBeInTheDocument();
  });

  it("글 관리: 카테고리를 보여주고, 고른 글을 다른 카테고리로 옮긴다", async () => {
    const backend = renderManage("/marco/manage/posts", {
      [POSTS]: ok([
        postSummary(1, { title: "분류 글", category: { id: 12, name: "Spring" } }),
        postSummary(2, { title: "미분류 글" }),
      ]),
      [BULK]: ok({ updated: 1 }),
    });

    const list = await screen.findByRole("list", { name: "글 목록" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("카테고리: Spring");
    expect(items[1]).toHaveTextContent("카테고리: 미분류");

    fireEvent.click(screen.getByLabelText("미분류 글 선택"));
    const target = screen.getByLabelText("옮길 카테고리");
    expect(
      within(target)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["미분류", "Spring"]);
    fireEvent.change(target, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "옮기기" }));

    expect(await screen.findByRole("status")).toHaveTextContent("글 1편을 바꿨습니다.");
    expect(backend.callsTo(BULK)[0].body).toEqual({
      postIds: [2],
      action: "MOVE_CATEGORY",
      categoryId: 12,
    });
  });

  it("빈 목록·빈 휴지통 안내", async () => {
    renderManage("/marco/manage/posts?q=없는", { [POSTS]: ok([]) });
    expect(await screen.findByText("조건에 맞는 글이 없습니다.")).toBeInTheDocument();
  });

  it("휴지통: 영구 삭제 날짜, 복구하면 안내하고 목록에서 빠진다", async () => {
    let items = [trashed(5, { title: "버린 글" }), trashed(6, { title: "" })];
    const backend = renderManage("/marco/manage/posts?status=DELETED", {
      [POSTS]: () => ok(items),
      "POST /api/v1/posts/5/restore": () => {
        items = items.filter((post) => post.id !== 5);
        return ok(postSummary(5));
      },
    });

    expect(await screen.findByRole("heading", { name: "휴지통" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "휴지통" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("2026년 11월 4일에 영구 삭제")).toHaveLength(2);
    expect(screen.getByText(/30일이 지나면 영구 삭제/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "휴지통으로 옮기기" })).toBeNull();
    expect(screen.queryByLabelText("상태")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "복구: 버린 글" }));

    expect(await screen.findByRole("status")).toHaveTextContent("글을 복구했습니다.");
    expect(backend.callsTo(POSTS)[0].url.searchParams.get("status")).toBe("DELETED");
    expect(await screen.findByRole("button", { name: "복구: (제목 없음)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "복구: 버린 글" })).toBeNull();
  });

  it("빈 휴지통", async () => {
    renderManage("/marco/manage/posts?status=DELETED", { [POSTS]: ok([]) });
    expect(await screen.findByText("휴지통이 비어 있습니다.")).toBeInTheDocument();
  });

  it("블로그 설정: 대표 이미지를 purpose=BLOG_COVER로 올려 600x400으로 미리 보고 저장한다", async () => {
    const key = "Cv9Yy8Xx7Ww6Vv5Uu4Tt3S";
    const backend = renderManage("/marco/manage/settings", {
      "POST /api/v1/media": ok(
        { key, url: `/media/${key}`, mime: "image/jpeg", size: 100, width: 1200, height: 800 },
        { status: 201 },
      ),
      "PATCH /api/v1/blogs/marco": ok(blog),
    });

    const current = await screen.findByRole("img", { name: "블로그 대표 이미지 미리보기" });
    expect(current).toHaveAttribute("src", thumbnailImage(blog.coverImageUrl!, "cover").src);
    fireEvent.change(screen.getByLabelText("이미지 파일 고르기"), {
      target: { files: [new File([new Uint8Array(100)], "cover.jpg", { type: "image/jpeg" })] },
    });
    await vi.waitFor(() =>
      expect(screen.getByRole("img", { name: "블로그 대표 이미지 미리보기" })).toHaveAttribute(
        "src",
        `/media/${key}/600x400`,
      ),
    );
    expect((backend.callsTo("POST /api/v1/media")[0].body as FormData).get("purpose")).toBe(
      "BLOG_COVER",
    );
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("블로그 설정을 저장했습니다.")).toBeInTheDocument();
    expect(backend.callsTo("PATCH /api/v1/blogs/marco")[0].body).toMatchObject({
      coverImageMediaKey: key,
    });
  });

  it("블로그 설정: 기본 주제를 고르고 포털 노출을 끄면 그대로 보낸다", async () => {
    const backend = renderManage("/marco/manage/settings", {
      [TOPICS]: ok(topics),
      "PATCH /api/v1/blogs/marco": ok(blog),
    });

    const select = await screen.findByRole("combobox", { name: "새 글의 기본 주제" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["선택 안 함", "java 한"]);
    fireEvent.change(select, { target: { value: "11" } });
    fireEvent.click(screen.getByLabelText("포털에 이 블로그의 글 소개하기"));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("status")).toHaveTextContent("블로그 설정을 저장했습니다.");
    expect(backend.callsTo("PATCH /api/v1/blogs/marco")[0].body).toMatchObject({
      portalEnabled: false,
      defaultTopicId: 11,
    });
  });

  it("블로그 설정: 방명록 사용·비회원 허용 체크와 안내(004)", async () => {
    const backend = renderManage("/marco/manage/settings", {
      [BLOG]: ok({ ...blog, guestbookEnabled: true, guestWriteEnabled: false }),
      "PATCH /api/v1/blogs/marco": ok(blog),
    });

    const guestbook = await screen.findByLabelText("방명록 사용");
    const guest = screen.getByLabelText("비회원 댓글·방명록 허용");
    expect(guestbook).toBeChecked();
    expect(guest).not.toBeChecked();
    expect(
      screen.getByText(/이름과 비밀번호를 적고 댓글과 방명록을 쓸 수 있습니다/),
    ).toBeInTheDocument();
    fireEvent.click(guestbook);
    fireEvent.click(guest);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("status")).toHaveTextContent("블로그 설정을 저장했습니다.");
    expect(backend.callsTo("PATCH /api/v1/blogs/marco")[0].body).toMatchObject({
      guestbookEnabled: false,
      guestWriteEnabled: true,
    });
  });

  it("블로그 설정: 저장하면 안내, 검증 오류는 입력란에", async () => {
    let fail400 = false;
    const backend = renderManage("/marco/manage/settings", {
      "PATCH /api/v1/blogs/marco": () =>
        fail400
          ? fail(400, "VALIDATION_FAILED", [
              { field: "description", code: "TOO_LONG", params: { max: 500 } },
            ])
          : ok(blog),
    });

    const title = await screen.findByLabelText("블로그 제목");
    expect(title).toHaveValue(blog.title);
    expect(screen.getByLabelText("포털에 이 블로그의 글 소개하기")).toBeChecked();
    expect(screen.getByRole("combobox", { name: "새 글의 기본 주제" })).toHaveValue("");
    expect(screen.getByLabelText("블로그 소개")).toHaveValue(blog.description);
    expect(screen.getByLabelText("이 블로그에 댓글 허용")).toBeChecked();
    fireEvent.change(title, { target: { value: "새 제목" } });
    fireEvent.click(screen.getByLabelText("이 블로그에 댓글 허용"));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("status")).toHaveTextContent("블로그 설정을 저장했습니다.");
    expect(backend.callsTo("PATCH /api/v1/blogs/marco")[0].body).toEqual({
      title: "새 제목",
      description: blog.description,
      commentEnabled: false,
      portalEnabled: true,
      guestbookEnabled: true,
      guestWriteEnabled: false,
      defaultTopicId: null,
    });

    fail400 = true;
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("500자 이하로 입력해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("입력한 내용을 확인해 주세요.");
  });
});
