// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BlogHome, { action, loader, meta, shouldRevalidate } from "~/routes/blog-home";

import { fail, mockBackend, ok } from "../support/backend";
import { blog, postSummary } from "../support/fixtures";
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

const BLOG = "GET /api/v1/blogs/marco";
const POSTS = "GET /api/v1/blogs/marco/posts";

const callLoader = (path: string) =>
  loader(routeArgs<LoaderArgs>(getRequest(path), { handle: path.split(/[/?]/)[1] }));

describe("blog home loader", () => {
  it("/blogs/{handle}와 /blogs/{handle}/posts(첫 페이지 page=0)를 부른다", async () => {
    const posts = [postSummary(2), postSummary(1)];
    const backend = mockBackend({ [BLOG]: ok(blog), [POSTS]: ok(posts, { totalCount: 2 }) });

    const result = await callLoader("/marco");

    expect(result).toEqual({
      blog,
      posts,
      totalCount: 2,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
    });
    expect(backend.callsTo(POSTS)[0].url.searchParams.get("page")).toBe("0");
  });

  it("?page=3은 backend page=2", async () => {
    const backend = mockBackend({ [BLOG]: ok(blog), [POSTS]: ok([], { totalCount: 41 }) });

    const result = await callLoader("/marco?page=3");

    expect(result.page).toBe(3);
    expect(backend.callsTo(POSTS)[0].url.searchParams.get("page")).toBe("2");
  });

  it.each(["0", "-1", "abc", "1.5", "99999999999"])("잘못된 page(%s)는 첫 페이지", async (page) => {
    const backend = mockBackend({ [BLOG]: ok(blog), [POSTS]: ok([], { totalCount: 0 }) });

    expect((await callLoader(`/marco?page=${page}`)).page).toBe(1);
    expect(backend.callsTo(POSTS)[0].url.searchParams.get("page")).toBe("0");
  });

  it("없는 블로그는 HTTP 404", async () => {
    mockBackend({
      "GET /api/v1/blogs/nobody": fail(404, "BLOG_NOT_FOUND"),
      "GET /api/v1/blogs/nobody/posts": fail(404, "BLOG_NOT_FOUND"),
    });

    expect(statusOf(await caught(callLoader("/nobody")))).toBe(404);
  });

  it.each(["favicon.ico", "Marco", "a", "bad--name"])(
    "블로그 주소 규칙에 맞지 않는 %s는 backend를 부르지 않고 404",
    async (handle) => {
      const backend = mockBackend();

      const thrown = await caught(
        loader(routeArgs<LoaderArgs>(getRequest(`/${handle}`), { handle })),
      );

      expect(statusOf(thrown)).toBe(404);
      expect(backend.calls).toHaveLength(0);
    },
  );
});

describe("blog home meta", () => {
  const metaArgs = (data: LoaderData | undefined) =>
    ({
      data,
      loaderData: data,
      params: { handle: "marco" },
      matches: [{ id: "root", loaderData: rootData("ko") }],
    }) as unknown as MetaArgs;

  it("블로그 제목·소개·og:image(대표 이미지 1200x630 절대 주소)·canonical", () => {
    const data: LoaderData = {
      blog,
      posts: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      origin: "https://blog.java21.net",
    };

    const tags = meta(metaArgs(data));

    expect(tags).toEqual(
      expect.arrayContaining([
        { title: "마르코의 블로그" },
        { name: "description", content: "자바와 스프링 이야기" },
        { property: "og:title", content: "마르코의 블로그" },
        { property: "og:description", content: "자바와 스프링 이야기" },
        {
          property: "og:image",
          content: "https://blog.java21.net/media/cover00000000000000000/1200x630",
        },
        { property: "og:url", content: "https://blog.java21.net/marco" },
        { tagName: "link", rel: "canonical", href: "https://blog.java21.net/marco" },
      ]),
    );
    expect(tags).not.toContainEqual({ name: "robots", content: "noindex" });
  });

  it("2쪽부터는 canonical에 page가 붙고, 소개·대표 이미지가 없으면 넣지 않는다", () => {
    const data: LoaderData = {
      blog: { ...blog, description: null, coverImageUrl: null },
      posts: [],
      totalCount: 30,
      page: 2,
      pageSize: 20,
      origin: "https://blog.java21.net",
    };

    const tags = meta(metaArgs(data));

    expect(tags).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.java21.net/marco?page=2",
    });
    expect(tags.some((tag) => "name" in tag && tag.name === "description")).toBe(false);
    expect(tags.some((tag) => "property" in tag && tag.property === "og:image")).toBe(false);
  });

  it("오류(404)면 찾을 수 없음 제목과 noindex", () => {
    expect(meta(metaArgs(undefined))).toEqual([
      { title: "페이지를 찾을 수 없습니다 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("blog home 화면", () => {
  function renderHome(data: LoaderData) {
    return renderRoutes([{ path: ":handle", loader: () => data, Component: BlogHome }], {
      initialEntries: ["/marco"],
    });
  }

  it("제목·소개·글쓴이·카테고리, 최신순 글 목록(상세 링크)", async () => {
    renderHome({
      blog,
      posts: [postSummary(2, { title: "두 번째 글" }), postSummary(1, { title: "첫 글" })],
      totalCount: 2,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
    });

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("마르코의 블로그");
    expect(screen.getByText("자바와 스프링 이야기")).toBeInTheDocument();
    expect(screen.getByText("마르코 님의 블로그")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "카테고리" })).toHaveTextContent("Spring");
    const list = screen.getByRole("list", { name: "글 목록" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["두 번째 글", "/marco/2"],
      ["첫 글", "/marco/1"],
    ]);
    expect(within(list).getAllByText(/^조회 \d+$/)).toHaveLength(2);
    expect(within(list).getAllByText("2026년 10월 6일")).toHaveLength(2);
    expect(screen.queryByRole("navigation", { name: "페이지" })).toBeNull();
  });

  it("대표 이미지(600x400)·주인 프로필(100x100)·글 카드 썸네일(300x200), 각각 2배 srcset", async () => {
    const thumb = "/media/k3Jd9fQ2xLmA7pZ0bR5tYw";
    const profile = "/media/Pf9Yy8Xx7Ww6Vv5Uu4Tt3S";
    const { container } = renderHome({
      blog: { ...blog, owner: { ...blog.owner, profileImageUrl: profile } },
      posts: [postSummary(1, { thumbnailUrl: thumb }), postSummary(2)],
      totalCount: 2,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
    });
    await screen.findByRole("heading", { level: 1 });

    const cover = container.querySelector("img.blog-cover");
    expect(cover).toHaveAttribute("src", `${blog.coverImageUrl}/600x400`);
    expect(cover).toHaveAttribute(
      "srcset",
      `${blog.coverImageUrl}/600x400 1x, ${blog.coverImageUrl}/1200x800 2x`,
    );
    const avatar = container.querySelector("img.avatar");
    expect(avatar).toHaveAttribute("src", `${profile}/100x100`);
    expect(avatar).toHaveAttribute("srcset", `${profile}/100x100 1x, ${profile}/200x200 2x`);
    const cards = container.querySelectorAll("img.post-thumbnail");
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute("src", `${thumb}/300x200`);
    expect(cards[0]).toHaveAttribute("srcset", `${thumb}/300x200 1x, ${thumb}/600x400 2x`);
    expect(cards[0]).toHaveAttribute("width", "300");
    expect(cards[0]).toHaveAttribute("height", "200");
  });

  it("20개가 넘으면 페이지 이동(이전·번호·다음)", async () => {
    renderHome({
      blog,
      posts: Array.from({ length: 20 }, (_, i) => postSummary(30 - i)),
      totalCount: 45,
      page: 2,
      pageSize: 20,
      origin: "http://front.test",
    });

    const nav = await screen.findByRole("navigation", { name: "페이지" });
    expect(within(nav).getByRole("link", { name: "이전" })).toHaveAttribute("href", "/marco");
    expect(within(nav).getByRole("link", { name: "다음" })).toHaveAttribute(
      "href",
      "/marco?page=3",
    );
    expect(within(nav).getByRole("link", { name: "3" })).toHaveAttribute("href", "/marco?page=3");
    expect(within(nav).getByText("2")).toHaveAttribute("aria-current", "page");
  });

  it("글이 없으면 빈 블로그 안내", async () => {
    renderHome({
      blog: { ...blog, description: null, categories: [] },
      posts: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
    });

    expect(await screen.findByText("아직 발행한 글이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "카테고리" })).toBeNull();
  });
});

describe("blog home 구독(002 T028)", () => {
  type ActionArgs = Parameters<typeof action>[0];
  const SUBSCRIBE = "PUT /api/v1/me/subscriptions/marco";
  const UNSUBSCRIBE = "DELETE /api/v1/me/subscriptions/marco";
  const callAction = (
    fields: Record<string, string>,
    handle = "marco",
    headers = { cookie: "access_token=a" },
  ) => action(routeArgs<ActionArgs>(formRequest(`/${handle}`, fields, headers), { handle }));

  it("intent=subscribe는 PUT, unsubscribe는 DELETE /me/subscriptions/{handle}", async () => {
    const backend = mockBackend({
      [SUBSCRIBE]: ok({ handle: "marco", subscribed: true, subscriberCount: 4 }),
      [UNSUBSCRIBE]: ok({ handle: "marco", subscribed: false, subscriberCount: 3 }),
    });

    expect(asData(await callAction({ intent: "subscribe" })).data).toEqual({
      intent: "subscribe",
      ok: true,
      subscribed: true,
      subscriberCount: 4,
    });
    expect(asData(await callAction({ intent: "unsubscribe" })).data).toEqual({
      intent: "unsubscribe",
      ok: true,
      subscribed: false,
      subscriberCount: 3,
    });
    expect(backend.callsTo(SUBSCRIBE)).toHaveLength(1);
    expect(backend.callsTo(UNSUBSCRIBE)).toHaveLength(1);
  });

  it("내 블로그(CANNOT_SUBSCRIBE_OWN_BLOG)는 422와 오류 코드", async () => {
    mockBackend({ [SUBSCRIBE]: fail(422, "CANNOT_SUBSCRIBE_OWN_BLOG") });

    const result = asData(await callAction({ intent: "subscribe" }));

    expect(result.init?.status).toBe(422);
    expect(result.data).toEqual({
      intent: "subscribe",
      ok: false,
      resultCode: "CANNOT_SUBSCRIBE_OWN_BLOG",
    });
  });

  it("비로그인(401)은 이 블로그로 돌아오는 로그인 화면으로", async () => {
    mockBackend({ [SUBSCRIBE]: fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(callAction({ intent: "subscribe" }, "marco", { cookie: "" })),
    );

    expect(location).toBe("/login?next=%2Fmarco");
  });

  it("모르는 작업은 400, 잘못된 주소는 404(backend를 부르지 않음)", async () => {
    const backend = mockBackend();

    expect(statusOf(await caught(callAction({ intent: "hack" })))).toBe(400);
    expect(statusOf(await caught(callAction({ intent: "subscribe" }, "Bad")))).toBe(404);
    expect(backend.calls).toHaveLength(0);
  });

  it("구독 뒤에는 다시 읽지 않는다", () => {
    const args = (intent: string | null) =>
      ({
        formData:
          intent === null ? undefined : (new URLSearchParams({ intent }) as unknown as FormData),
        defaultShouldRevalidate: true,
      }) as Parameters<typeof shouldRevalidate>[0];

    expect(shouldRevalidate(args("subscribe"))).toBe(false);
    expect(shouldRevalidate(args(null))).toBe(true);
  });

  function renderHome(
    user: { userId: number; nickname: string; role: string; blogs?: string[] } | null,
    overrides: Partial<typeof blog> = {},
  ) {
    const data: LoaderData = {
      blog: { ...blog, ...overrides },
      posts: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
    };
    renderRoutes([{ path: ":handle", loader: () => data, Component: BlogHome }], {
      initialEntries: ["/marco"],
      user,
    });
  }

  it("구독자 수와 구독 버튼(구독 중이면 취소)", async () => {
    renderHome(
      { userId: 2, nickname: "독자", role: "USER", blogs: ["reader"] },
      { subscribedByMe: true, subscriberCount: 10 },
    );

    expect(await screen.findByRole("button", { name: "구독 중 (취소)" })).toBeInTheDocument();
    expect(screen.getByText("구독자 10명")).toBeInTheDocument();
  });

  it("내 블로그는 버튼 없이 수만, 비로그인은 로그인 링크", async () => {
    renderHome({ userId: 1, nickname: "마르코", role: "USER", blogs: ["marco"] });

    expect(await screen.findByText("구독자 3명")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "구독" })).toBeNull();
  });

  it("비로그인은 로그인 링크", async () => {
    renderHome(null);

    expect(await screen.findByRole("link", { name: "로그인하고 구독하기" })).toHaveAttribute(
      "href",
      "/login?next=%2Fmarco",
    );
  });
});
