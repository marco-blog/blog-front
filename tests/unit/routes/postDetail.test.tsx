// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PostDetailRoute, {
  action,
  links,
  loader,
  meta,
  shouldRevalidate,
} from "~/routes/post-detail";

import { fail, mockBackend, ok } from "../support/backend";
import { postDetail, postWithoutMarkdown } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
} from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const POST = "GET /api/v1/posts/123";
const VIEWS = "POST /api/v1/posts/123/views";
const COMMENTS = "GET /api/v1/posts/123/comments";

const callLoader = (handle: string, postId: string, headers: Record<string, string> = {}) =>
  loader(routeArgs<LoaderArgs>(getRequest(`/${handle}/${postId}`, headers), { handle, postId }));

describe("post detail loader", () => {
  it("글을 불러오고 조회수를 기록하며, 코드 블록을 강조한다", async () => {
    const backend = mockBackend({ [POST]: ok(postDetail), [VIEWS]: ok(null) });

    const result = await callLoader("marco", "123", { cookie: "visitor_id=v1" });

    expect(result.post.title).toBe("JPA N+1 정리");
    expect(result.post.contentHtml).toContain('<span class="hljs-keyword">public</span>');
    expect(result.post).not.toHaveProperty("contentMarkdown");
    expect(result).toMatchObject({ isOwner: false, origin: "http://front.test" });
    expect(backend.callsTo(VIEWS)).toHaveLength(1);
    expect(backend.callsTo(VIEWS)[0].headers.get("cookie")).toBe("visitor_id=v1");
    // 브라우저가 보낸 Origin이 없는 서버 요청이라 front 자기 출처를 싣는다(backend Origin 검사).
    expect(backend.callsTo(VIEWS)[0].headers.get("origin")).toBe("http://front.test");
  });

  it("댓글을 글과 함께 읽고, 댓글을 읽지 못해도 글은 보여준다(null)", async () => {
    const comments = [
      {
        id: 1,
        content: "좋은 글",
        author: { userId: 2, nickname: "작성자", profileImageUrl: null },
        deleted: false,
        createdAt: "2026-10-06T05:00:00Z",
        updatedAt: "2026-10-06T05:00:00Z",
        replies: [],
      },
    ];
    const backend = mockBackend({
      [POST]: ok(postDetail),
      [VIEWS]: ok(null),
      [COMMENTS]: ok(comments),
    });

    await expect(callLoader("marco", "123")).resolves.toMatchObject({ comments });
    expect(backend.callsTo(COMMENTS)).toHaveLength(1);

    mockBackend({
      [POST]: ok(postDetail),
      [VIEWS]: ok(null),
      [COMMENTS]: fail(500, "INTERNAL_ERROR"),
    });
    await expect(callLoader("marco", "123")).resolves.toMatchObject({ comments: null });
  });

  it("조회수 기록이 실패해도 글은 보여준다", async () => {
    mockBackend({ [POST]: ok(postDetail), [VIEWS]: fail(500, "INTERNAL_ERROR") });

    await expect(callLoader("marco", "123")).resolves.toMatchObject({ post: { id: 123 } });
  });

  it("주인에게는 contentMarkdown이 오므로 주인으로 본다(본문 원문은 화면에 넘기지 않음)", async () => {
    mockBackend({
      [POST]: ok({ ...postDetail, contentMarkdown: "# 원문", status: "DRAFT" }),
      [VIEWS]: ok(null),
    });

    const result = await callLoader("marco", "123");

    expect(result.isOwner).toBe(true);
    expect(JSON.stringify(result)).not.toContain("# 원문");
  });

  it.each(["abc", "12a", "0", "-1", "1.5", "1234567890123456789"])(
    "postId(%s)가 숫자 글 번호가 아니면 backend를 부르지 않고 404",
    async (postId) => {
      const backend = mockBackend();

      expect(statusOf(await caught(callLoader("marco", postId)))).toBe(404);
      expect(backend.calls).toHaveLength(0);
    },
  );

  it.each([
    ["비공개·없는 글", "POST_NOT_FOUND"],
    ["삭제된 블로그", "BLOG_NOT_FOUND"],
  ])("%s은 HTTP 404", async (_name, code) => {
    const backend = mockBackend({ [POST]: fail(404, code) });

    expect(statusOf(await caught(callLoader("marco", "123")))).toBe(404);
    expect(backend.callsTo(VIEWS)).toHaveLength(0);
  });

  it("다른 블로그 주소로 열면 404(글은 처음 정한 블로그에만 있다)", async () => {
    const backend = mockBackend({ [POST]: ok(postDetail) });

    expect(statusOf(await caught(callLoader("other", "123")))).toBe(404);
    expect(backend.callsTo(VIEWS)).toHaveLength(0);
  });

  it("블로그 주소 규칙에 맞지 않으면 404", async () => {
    mockBackend();
    expect(statusOf(await caught(callLoader("Bad", "123")))).toBe(404);
  });
});

describe("post detail meta", () => {
  const data = (overrides: Partial<LoaderData["post"]> = {}): LoaderData => {
    const post = postWithoutMarkdown();
    return {
      post: { ...post, ...overrides },
      isOwner: false,
      origin: "https://blog.java21.net",
      comments: [],
    };
  };
  const metaArgs = (loaderData: LoaderData | undefined) =>
    ({
      data: loaderData,
      loaderData,
      params: { handle: "marco", postId: "123" },
      matches: [{ id: "root", loaderData: rootData("ko") }],
    }) as unknown as MetaArgs;

  it("title·description(summary)·og:title/description/image/url·canonical", () => {
    const tags = meta(metaArgs(data()));

    expect(tags).toEqual(
      expect.arrayContaining([
        { title: "JPA N+1 정리" },
        { name: "description", content: "N+1 문제를 정리한다" },
        { property: "og:title", content: "JPA N+1 정리" },
        { property: "og:description", content: "N+1 문제를 정리한다" },
        { property: "og:type", content: "article" },
        {
          property: "og:image",
          content: "https://blog.java21.net/media/k3Jd9fQ2xLmA7pZ0bR5tYw/1200x630",
        },
        { property: "og:url", content: "https://blog.java21.net/marco/123" },
        { tagName: "link", rel: "canonical", href: "https://blog.java21.net/marco/123" },
      ]),
    );
    expect(tags).not.toContainEqual({ name: "robots", content: "noindex" });
  });

  it("주인만 보는 임시저장·비공개 글은 noindex", () => {
    expect(meta(metaArgs(data({ status: "DRAFT" })))).toContainEqual({
      name: "robots",
      content: "noindex",
    });
    expect(meta(metaArgs(data({ visibility: "PRIVATE" })))).toContainEqual({
      name: "robots",
      content: "noindex",
    });
  });

  it("404면 찾을 수 없음", () => {
    expect(meta(metaArgs(undefined))).toEqual([
      { title: "페이지를 찾을 수 없습니다 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });

  it("강조 테마 CSS만 브라우저로 보낸다", () => {
    expect(links()).toEqual([{ rel: "stylesheet", href: expect.any(String) }]);
  });
});

describe("post detail 화면", () => {
  function renderPost(data: LoaderData) {
    return renderRoutes(
      [{ path: ":handle/:postId", loader: () => data, Component: PostDetailRoute }],
      {
        initialEntries: ["/marco/123"],
      },
    );
  }

  const loaded = (overrides: Partial<LoaderData> = {}): LoaderData => {
    const post = postWithoutMarkdown();
    return { post, isOwner: false, origin: "http://front.test", comments: [], ...overrides };
  };

  it("작성자 프로필 이미지는 50x50 썸네일", async () => {
    const profile = "/media/Pf9Yy8Xx7Ww6Vv5Uu4Tt3S";
    const post = postWithoutMarkdown();
    renderPost(loaded({ post: { ...post, author: { ...post.author, profileImageUrl: profile } } }));

    const article = await screen.findByRole("article");
    expect(article.querySelector("img.avatar")).toHaveAttribute("src", `${profile}/50x50`);
  });

  it("제목·본문·작성자·작성일·카테고리·태그·조회수, 이전 글 링크", async () => {
    renderPost(loaded());

    const article = await screen.findByRole("article");
    expect(within(article).getByRole("heading", { level: 1 })).toHaveTextContent("JPA N+1 정리");
    expect(article).toHaveTextContent("본문입니다.");
    expect(article.querySelector("pre code.language-java")).not.toBeNull();
    expect(article).toHaveTextContent("마르코");
    expect(within(article).getByText("2026년 10월 6일")).toHaveAttribute(
      "dateTime",
      "2026-10-06T04:24:19Z",
    );
    expect(article).toHaveTextContent("Spring");
    expect(article).toHaveTextContent("#jpa");
    expect(within(article).getByRole("link", { name: "Spring" })).toHaveAttribute(
      "href",
      "/marco/category/12",
    );
    expect(within(article).getByRole("link", { name: "#jpa" })).toHaveAttribute(
      "href",
      "/marco/tags/jpa",
    );
    expect(within(article).getByRole("link", { name: "#spring" })).toHaveAttribute(
      "href",
      "/marco/tags/spring",
    );
    expect(article).toHaveTextContent("조회 10");

    const nav = screen.getByRole("navigation", { name: "이전·다음 글" });
    expect(within(nav).getByRole("link", { name: /이전 글 제목/ })).toHaveAttribute(
      "href",
      "/marco/122",
    );
    expect(within(nav).queryByText("다음 글")).toBeNull();
    expect(screen.queryByRole("link", { name: "수정" })).toBeNull();
  });

  it("주인에게는 수정 링크와 상태(임시저장·비공개)를 보여준다", async () => {
    renderPost(
      loaded({
        isOwner: true,
        post: {
          ...loaded().post,
          status: "DRAFT",
          visibility: "PRIVATE",
          prev: null,
          publishedAt: null,
        },
      }),
    );

    expect(await screen.findByRole("link", { name: "수정" })).toHaveAttribute(
      "href",
      "/marco/write/123",
    );
    expect(screen.getByText("임시저장")).toBeInTheDocument();
    expect(screen.getByText("비공개")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "이전·다음 글" })).toBeNull();
  });
});

describe("post detail action(댓글)", () => {
  type ActionArgs = Parameters<typeof action>[0];
  const COMMENT_POST = "POST /api/v1/posts/123/comments";
  const callAction = (fields: Record<string, string>, handle = "marco", postId = "123") =>
    action(
      routeArgs<ActionArgs>(
        formRequest(`/${handle}/${postId}`, fields, { cookie: "access_token=a" }),
        {
          handle,
          postId,
        },
      ),
    );

  it("댓글·답글 쓰기는 POST /posts/{id}/comments", async () => {
    const backend = mockBackend({ [COMMENT_POST]: ok({ id: 1 }, { status: 201 }) });

    const created = asData(await callAction({ intent: "create", target: "new", content: "안녕" }));
    const reply = asData(
      await callAction({ intent: "create", target: "reply-7", parentId: "7", content: "답" }),
    );

    expect(created.data).toEqual({ intent: "create", target: "new", ok: true });
    expect(reply.data).toEqual({ intent: "create", target: "reply-7", ok: true });
    expect(backend.callsTo(COMMENT_POST).map((call) => call.body)).toEqual([
      { content: "안녕", parentId: null },
      { content: "답", parentId: 7 },
    ]);
  });

  it("수정은 PATCH, 삭제는 DELETE /comments/{id}", async () => {
    const backend = mockBackend({
      "PATCH /api/v1/comments/5": ok({ id: 5 }),
      "DELETE /api/v1/comments/5": ok(null),
    });

    await callAction({ intent: "edit", target: "edit-5", commentId: "5", content: "고침" });
    await callAction({ intent: "delete", target: "delete-5", commentId: "5" });

    expect(backend.callsTo("PATCH /api/v1/comments/5")[0].body).toEqual({ content: "고침" });
    expect(backend.callsTo("DELETE /api/v1/comments/5")).toHaveLength(1);
  });

  it("빈 내용·1000자 초과는 backend를 부르지 않고 필드 오류", async () => {
    const backend = mockBackend();

    const blank = asData<{ fieldErrors: unknown[] }>(
      await callAction({ intent: "create", target: "new", content: "   " }),
    );
    const long = asData<{ fieldErrors: unknown[] }>(
      await callAction({
        intent: "edit",
        target: "edit-5",
        commentId: "5",
        content: "가".repeat(1001),
      }),
    );

    expect(blank.init?.status).toBe(400);
    expect(blank.data.fieldErrors).toEqual([{ field: "content", code: "REQUIRED" }]);
    expect(long.data.fieldErrors).toEqual([
      { field: "content", code: "TOO_LONG", params: { max: 1000 } },
    ]);
    expect(backend.calls).toHaveLength(0);
  });

  it("잘못된 요청(모르는 작업, 숫자가 아닌 id, 이상한 target)은 400", async () => {
    mockBackend();

    const cases: Record<string, string>[] = [
      { intent: "hack", target: "new" },
      { intent: "delete", target: "delete-x", commentId: "x" },
      { intent: "create", target: "<script>", parentId: "abc", content: "a" },
    ];
    for (const fields of cases) {
      const result = asData<{ target: string }>(await callAction(fields));
      expect(result.init?.status).toBe(400);
      expect(result.data.target).toBe("new");
    }
  });

  it("backend 오류(COMMENTS_DISABLED·REPLY_DEPTH_EXCEEDED)는 상태 코드와 함께 폼에", async () => {
    mockBackend({ [COMMENT_POST]: fail(422, "REPLY_DEPTH_EXCEEDED") });

    const result = asData(
      await callAction({ intent: "create", target: "reply-2", parentId: "2", content: "답" }),
    );

    expect(result.init?.status).toBe(422);
    expect(result.data).toMatchObject({
      ok: false,
      resultCode: "REPLY_DEPTH_EXCEEDED",
      target: "reply-2",
    });
  });

  it("로그인이 풀렸으면(401) 이 글로 돌아오는 로그인 화면으로", async () => {
    mockBackend({
      [COMMENT_POST]: fail(401, "UNAUTHENTICATED"),
      "POST /api/v1/auth/refresh": fail(401, "REFRESH_INVALID"),
    });

    const location = expectRedirect(
      await caught(callAction({ intent: "create", target: "new", content: "안녕" })),
    );

    expect(location).toBe("/login?next=%2Fmarco%2F123");
  });

  it("글 주소가 잘못되면 404", async () => {
    mockBackend();
    expect(statusOf(await caught(callAction({ intent: "delete" }, "marco", "abc")))).toBe(404);
  });
});

describe("post detail 화면의 댓글", () => {
  it("글 아래에 댓글 목록과, 비로그인에게 로그인 안내", async () => {
    const data: LoaderData = {
      post: postWithoutMarkdown(),
      isOwner: false,
      origin: "http://front.test",
      comments: [
        {
          id: 1,
          content: "첫 댓글",
          author: { userId: 2, nickname: "작성자", profileImageUrl: null },
          deleted: false,
          createdAt: "2026-10-06T05:00:00Z",
          updatedAt: "2026-10-06T05:00:00Z",
          replies: [],
        },
      ],
    };
    renderRoutes([{ path: ":handle/:postId", loader: () => data, Component: PostDetailRoute }], {
      initialEntries: ["/marco/123"],
    });

    expect(await screen.findByRole("heading", { name: "댓글 2" })).toBeInTheDocument();
    expect(screen.getByText("첫 댓글")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "댓글을 쓰려면 로그인하세요" })).toHaveAttribute(
      "href",
      "/login?next=%2Fmarco%2F123",
    );
  });

  it("발행 전 글(주인 미리보기)이나 댓글이 막힌 글은 쓰기 폼 대신 안내", async () => {
    const data: LoaderData = {
      post: { ...postWithoutMarkdown(), status: "DRAFT", commentEnabled: true },
      isOwner: true,
      origin: "http://front.test",
      comments: [],
    };
    renderRoutes([{ path: ":handle/:postId", loader: () => data, Component: PostDetailRoute }], {
      initialEntries: ["/marco/123"],
      user: { userId: 1, nickname: "마르코", role: "USER" },
    });

    expect(await screen.findByRole("note")).toHaveTextContent("이 글에는 댓글을 쓸 수 없습니다.");
  });
});

describe("post detail 좋아요(002 T027)", () => {
  type ActionArgs = Parameters<typeof action>[0];
  const LIKE = "PUT /api/v1/me/likes/123";
  const UNLIKE = "DELETE /api/v1/me/likes/123";
  const callAction = (fields: Record<string, string>, headers = { cookie: "access_token=a" }) =>
    action(
      routeArgs<ActionArgs>(formRequest("/marco/123", fields, headers), {
        handle: "marco",
        postId: "123",
      }),
    );

  it("intent=like는 PUT /me/likes/{id}, unlike는 DELETE, 응답의 수를 돌려준다", async () => {
    const backend = mockBackend({
      [LIKE]: ok({ postId: 123, liked: true, likeCount: 6 }),
      [UNLIKE]: ok({ postId: 123, liked: false, likeCount: 5 }),
    });

    const liked = asData(await callAction({ intent: "like" }));
    const unliked = asData(await callAction({ intent: "unlike" }));

    expect(liked.data).toEqual({ intent: "like", ok: true, liked: true, likeCount: 6 });
    expect(unliked.data).toEqual({ intent: "unlike", ok: true, liked: false, likeCount: 5 });
    expect(backend.callsTo(LIKE)).toHaveLength(1);
    expect(backend.callsTo(UNLIKE)).toHaveLength(1);
    expect(backend.callsTo("POST /api/v1/posts/123/comments")).toHaveLength(0);
  });

  it("볼 수 없는 글(POST_NOT_FOUND)은 상태 코드와 오류 코드를 돌려준다", async () => {
    mockBackend({ [LIKE]: fail(404, "POST_NOT_FOUND") });

    const result = asData(await callAction({ intent: "like" }));

    expect(result.init?.status).toBe(404);
    expect(result.data).toEqual({ intent: "like", ok: false, resultCode: "POST_NOT_FOUND" });
  });

  it("비로그인(401)은 이 글로 돌아오는 로그인 화면으로", async () => {
    mockBackend({ [LIKE]: fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(await caught(callAction({ intent: "like" }, { cookie: "" })));

    expect(location).toBe("/login?next=%2Fmarco%2F123");
  });

  it("댓글 intent는 그대로 댓글 API로", async () => {
    const backend = mockBackend({
      "POST /api/v1/posts/123/comments": ok({ id: 1 }, { status: 201 }),
    });

    await callAction({ intent: "create", target: "new", content: "안녕" });

    expect(backend.callsTo("POST /api/v1/posts/123/comments")).toHaveLength(1);
    expect(backend.callsTo(LIKE)).toHaveLength(0);
  });

  it("좋아요 뒤에는 글을 다시 읽지 않고, 그 밖의 작업은 기본 동작", () => {
    const args = (intent: string) =>
      ({
        formData: new URLSearchParams({ intent }) as unknown as FormData,
        defaultShouldRevalidate: true,
      }) as Parameters<typeof shouldRevalidate>[0];

    expect(shouldRevalidate(args("like"))).toBe(false);
    expect(shouldRevalidate(args("unlike"))).toBe(false);
    expect(shouldRevalidate(args("create"))).toBe(true);
  });

  function renderPost(user: { userId: number; nickname: string; role: string } | null, post = {}) {
    const data: LoaderData = {
      post: { ...postWithoutMarkdown(), ...post },
      isOwner: false,
      origin: "http://front.test",
      comments: [],
    };
    renderRoutes([{ path: ":handle/:postId", loader: () => data, Component: PostDetailRoute }], {
      initialEntries: ["/marco/123"],
      user,
    });
  }

  it("로그인 회원: 좋아요 수와 버튼(이미 눌렀으면 취소)", async () => {
    renderPost({ userId: 2, nickname: "독자", role: "USER" }, { likedByMe: true, likeCount: 7 });

    expect(await screen.findByRole("button", { name: "좋아요 취소" })).toBeInTheDocument();
    expect(screen.getByText("좋아요 7")).toBeInTheDocument();
  });

  it("비로그인: 수와 로그인 링크", async () => {
    renderPost(null);

    expect(await screen.findByRole("link", { name: "로그인하고 좋아요 누르기" })).toHaveAttribute(
      "href",
      "/login?next=%2Fmarco%2F123",
    );
    expect(screen.getByText("좋아요 5")).toBeInTheDocument();
  });

  it("발행 전 글(주인 미리보기)에는 좋아요가 없다", async () => {
    renderPost({ userId: 1, nickname: "마르코", role: "USER" }, { status: "DRAFT" });

    await screen.findByRole("article");
    expect(screen.queryByText(/^좋아요/)).toBeNull();
  });
});
