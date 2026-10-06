// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PostDetailRoute, { links, loader, meta } from "~/routes/post-detail";

import { fail, mockBackend, ok } from "../support/backend";
import { postDetail, postWithoutMarkdown } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const POST = "GET /api/v1/posts/123";
const VIEWS = "POST /api/v1/posts/123/views";

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
        { property: "og:image", content: "https://blog.java21.net/media/k3Jd9fQ2xLmA7pZ0bR5tYw" },
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
    return { post, isOwner: false, origin: "http://front.test", ...overrides };
  };

  it("제목·본문·작성자·작성일·카테고리·태그·조회수, 이전 글 링크", async () => {
    renderPost(loaded());

    const article = await screen.findByRole("article");
    expect(within(article).getByRole("heading", { level: 1 })).toHaveTextContent("JPA N+1 정리");
    expect(article).toHaveTextContent("본문입니다.");
    expect(article.querySelector("pre code.language-java")).not.toBeNull();
    expect(article).toHaveTextContent("마르코");
    expect(within(article).getByText("2026. 10. 6.")).toHaveAttribute(
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
