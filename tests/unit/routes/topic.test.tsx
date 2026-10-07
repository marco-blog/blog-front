// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { sortHref } from "~/components/portal/SortToggle";
import TopicPage, { loader, meta, parseSort, topicPageHref } from "~/routes/topic";

import { fail, mockBackend, ok } from "../support/backend";
import { portalCard, topicNode } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const TOPICS = "GET /api/v1/topics";
const itInternet = topicNode(12, "it-internet", { parentId: 5, onTab: true });
const mobile = topicNode(13, "mobile", { parentId: 5, onTab: false });
const daily = topicNode(21, "daily", { parentId: 1, onTab: true });
const tree = [
  topicNode(1, "life", { onTab: true }, [daily]),
  topicNode(5, "knowledge", { onTab: true }, [itInternet, mobile]),
];

const callLoader = (path: string, params: Record<string, string>) =>
  loader(routeArgs<LoaderArgs>(getRequest(path), params));

/** 주제 페이지(003 T062, FR-078, contracts/routes.md `/topics/:major/:minor?`) */
describe("topic loader", () => {
  it("대분류: /topics와 /topics/{major}/posts?sort=latest&page=0&size=20", async () => {
    const backend = mockBackend({
      [TOPICS]: ok(tree),
      "GET /api/v1/topics/knowledge/posts": ok([portalCard(1)], { totalCount: 41 }),
    });

    const data = await callLoader("/topics/knowledge", { major: "knowledge" });

    expect(data).toMatchObject({
      major: tree[1],
      current: null,
      path: "/topics/knowledge",
      sort: "latest",
      page: 1,
      posts: [portalCard(1)],
      totalCount: 41,
    });
    const url = backend.callsTo("GET /api/v1/topics/knowledge/posts")[0].url;
    expect(Object.fromEntries(url.searchParams)).toEqual({ sort: "latest", page: "0", size: "20" });
  });

  it("소분류·인기순·페이지: /topics/{minor}/posts?sort=popular&page=2", async () => {
    const backend = mockBackend({
      [TOPICS]: ok(tree),
      "GET /api/v1/topics/mobile/posts": ok([], { totalCount: 0 }),
    });

    const data = await callLoader("/topics/knowledge/mobile?sort=popular&page=3", {
      major: "knowledge",
      minor: "mobile",
    });

    expect(data).toMatchObject({
      current: mobile,
      path: "/topics/knowledge/mobile",
      sort: "popular",
    });
    const url = backend.callsTo("GET /api/v1/topics/mobile/posts")[0].url;
    expect(url.searchParams.get("sort")).toBe("popular");
    expect(url.searchParams.get("page")).toBe("2");
  });

  it.each([
    ["없는 slug", "/topics/nope", { major: "nope" }],
    ["대분류 자리의 소분류", "/topics/mobile", { major: "mobile" }],
    ["부모가 다른 소분류", "/topics/life/mobile", { major: "life", minor: "mobile" }],
  ])("%s는 404(글 API를 부르지 않는다)", async (_, path, params) => {
    const backend = mockBackend({ [TOPICS]: ok(tree) });
    expect(statusOf(await caught(callLoader(path, params)))).toBe(404);
    expect(backend.calls).toHaveLength(1);
  });

  it("backend TOPIC_NOT_FOUND는 404, 그 밖의 오류는 그 상태", async () => {
    mockBackend({
      [TOPICS]: ok(tree),
      "GET /api/v1/topics/life/posts": fail(404, "TOPIC_NOT_FOUND"),
    });
    expect(statusOf(await caught(callLoader("/topics/life", { major: "life" })))).toBe(404);

    mockBackend({
      [TOPICS]: ok(tree),
      "GET /api/v1/topics/life/posts": fail(500, "INTERNAL_ERROR"),
    });
    expect(statusOf(await caught(callLoader("/topics/life", { major: "life" })))).toBe(500);

    mockBackend({ [TOPICS]: fail(503, "INTERNAL_ERROR") });
    expect(statusOf(await caught(callLoader("/topics/life", { major: "life" })))).toBe(503);
  });

  it("정렬·페이지 주소 도우미", () => {
    expect(parseSort("popular")).toBe("popular");
    expect(parseSort("oldest")).toBe("latest");
    expect(parseSort(null)).toBe("latest");
    expect(topicPageHref("/topics/life", "latest", 1)).toBe("/topics/life");
    expect(topicPageHref("/topics/life", "popular", 1)).toBe("/topics/life?sort=popular");
    expect(topicPageHref("/topics/life", "popular", 3)).toBe("/topics/life?sort=popular&page=3");
    expect(topicPageHref("/topics/life", "latest", 2)).toBe("/topics/life?page=2");
    expect(sortHref("/topics/life", "latest")).toBe("/topics/life");
    expect(topicPageHref("/topics/life", "popular", 2, "external")).toBe(
      "/topics/life?sort=popular&source=external&page=2",
    );
    expect(sortHref("/topics/life", "popular", "internal")).toBe(
      "/topics/life?sort=popular&source=internal",
    );
  });

  it("?source=external(007)을 API에 넘기고, 모르는 값은 넘기지 않는다", async () => {
    const backend = mockBackend({
      [TOPICS]: ok(tree),
      "GET /api/v1/topics/knowledge/posts": ok([], { totalCount: 0 }),
    });

    const data = await callLoader("/topics/knowledge?source=external", { major: "knowledge" });
    expect(data.source).toBe("external");
    expect(
      backend.callsTo("GET /api/v1/topics/knowledge/posts")[0].url.searchParams.get("source"),
    ).toBe("external");

    const again = mockBackend({
      [TOPICS]: ok(tree),
      "GET /api/v1/topics/knowledge/posts": ok([], { totalCount: 0 }),
    });
    expect((await callLoader("/topics/knowledge?source=x", { major: "knowledge" })).source).toBe(
      "all",
    );
    expect(
      again.callsTo("GET /api/v1/topics/knowledge/posts")[0].url.searchParams.has("source"),
    ).toBe(false);
  });
});

describe("topic meta", () => {
  const data = (overrides: Partial<LoaderData> = {}) =>
    ({
      names: tree[1].names,
      path: "/topics/knowledge",
      sort: "latest",
      page: 1,
      origin: "https://blog.java21.net",
      ...overrides,
    }) as LoaderData;
  const args = (loaderData: LoaderData | undefined, language: "ko" | "en" = "ko") =>
    ({
      loaderData,
      matches: [{ id: "root", loaderData: rootData(language) }],
    }) as unknown as MetaArgs;

  it("{주제} - 서비스명, 설명, og, canonical(정렬 제외, 2쪽부터 ?page=)", () => {
    const tags = meta(args(data(), "en"));
    expect(tags).toContainEqual({ title: "knowledge en - Blog" });
    expect(tags).toContainEqual({ name: "description", content: "Posts about knowledge en." });
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.java21.net/topics/knowledge",
    });
    expect(meta(args(data({ page: 2, sort: "popular" })))).toEqual(
      expect.arrayContaining([
        {
          tagName: "link",
          rel: "canonical",
          href: "https://blog.java21.net/topics/knowledge?page=2",
        },
        { name: "robots", content: "noindex" },
      ]),
    );
    expect(meta(args(data()))).not.toContainEqual({ name: "robots", content: "noindex" });
  });

  it("출처 필터 주소는 noindex, canonical에서 출처 제외(007)", () => {
    const tags = meta(args(data({ source: "internal", page: 2 })));
    expect(tags).toContainEqual({ name: "robots", content: "noindex" });
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.java21.net/topics/knowledge?page=2",
    });
  });

  it("데이터가 없으면(404) 찾을 수 없음", () => {
    expect(meta(args(undefined))[0]).toEqual({ title: "페이지를 찾을 수 없습니다 - 블로그" });
  });
});

describe("topic 화면", () => {
  const loaded = (overrides: Partial<LoaderData> = {}): LoaderData =>
    ({
      major: tree[1],
      current: null,
      path: "/topics/knowledge",
      names: tree[1].names,
      sort: "latest",
      source: "all",
      page: 1,
      pageSize: 20,
      posts: [portalCard(1, { topicId: 12 }), portalCard(2)],
      totalCount: 41,
      topics: tree,
      now: "2026-10-06T07:24:19Z",
      origin: "http://front.test",
      ...overrides,
    }) as LoaderData;

  function renderTopic(data: LoaderData, entry = "/topics/knowledge") {
    return renderRoutes(
      [
        { path: "topics/:major", loader: () => data, Component: TopicPage },
        { path: "topics/:major/:minor", loader: () => data, Component: TopicPage },
      ],
      { initialEntries: [entry] },
    );
  }

  it("주제 이름, 소분류 목록(onTab과 전체), 정렬 링크, 카드, 페이지 이동이 정렬을 유지", async () => {
    renderTopic(loaded({ sort: "popular" }), "/topics/knowledge?sort=popular");

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("knowledge 한");
    const subtopics = screen.getByRole("navigation", { name: "소분류" });
    expect(
      within(subtopics)
        .getAllByRole("link")
        .map((l) => [l.textContent, l.getAttribute("href"), l.getAttribute("aria-current")]),
    ).toEqual([
      ["전체", "/topics/knowledge", "page"],
      ["it-internet 한", "/topics/knowledge/it-internet", null],
    ]);
    const sort = screen.getByRole("navigation", { name: "정렬" });
    expect(within(sort).getByRole("link", { name: "최신순" })).toHaveAttribute(
      "href",
      "/topics/knowledge",
    );
    expect(within(sort).getByRole("link", { name: "인기순" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("list", { name: "글 목록" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/topics/knowledge?sort=popular&page=2",
    );
  });

  it("소분류 페이지는 지금 소분류를 표시(자동 숨김이어도)", async () => {
    renderTopic(
      loaded({ current: mobile, names: mobile.names, path: "/topics/knowledge/mobile" }),
      "/topics/knowledge/mobile",
    );
    const subtopics = await screen.findByRole("navigation", { name: "소분류" });
    expect(within(subtopics).getByRole("link", { name: "mobile 한" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(subtopics).getByRole("link", { name: "전체" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("빈 상태: 최신순은 글 없음, 인기순은 최신순 안내", async () => {
    renderTopic(loaded({ posts: [], totalCount: 0 }));
    expect(await screen.findByText("이 주제에는 아직 글이 없습니다.")).toBeInTheDocument();
  });

  it("인기순 빈 상태", async () => {
    renderTopic(loaded({ posts: [], totalCount: 0, sort: "popular" }));
    expect(
      await screen.findByText("최근 7일 동안 반응을 얻은 글이 없습니다. 최신순으로 둘러보세요."),
    ).toBeInTheDocument();
  });
  it("정렬 옆 출처 필터: 정렬은 남기고 페이지는 버림, 페이지 이동은 출처 유지, 같은 id 내부·외부 카드", async () => {
    const external = portalCard(1, {
      source: "EXTERNAL",
      title: "외부 글 1",
      blog: { handle: null, title: "Dev Log" },
      author: null,
      externalBlog: { id: 1, title: "Dev Log", siteHost: "dev.example.com" },
      visitUrl: "/api/v1/external-posts/1/visit",
    });
    renderTopic(
      loaded({ sort: "popular", source: "external", posts: [portalCard(1), external] }),
      "/topics/knowledge?sort=popular&source=external",
    );

    const filter = await screen.findByRole("navigation", { name: "출처" });
    expect(
      within(filter)
        .getAllByRole("link")
        .map((l) => [l.getAttribute("href"), l.getAttribute("aria-current")]),
    ).toEqual([
      ["/topics/knowledge?sort=popular", null],
      ["/topics/knowledge?sort=popular&source=internal", null],
      ["/topics/knowledge?sort=popular&source=external", "page"],
    ]);
    const sort = screen.getByRole("navigation", { name: "정렬" });
    expect(within(sort).getByRole("link", { name: "최신순" })).toHaveAttribute(
      "href",
      "/topics/knowledge?source=external",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/topics/knowledge?sort=popular&source=external&page=2",
    );
  });

  it("출처 필터 빈 상태", async () => {
    renderTopic(loaded({ posts: [], totalCount: 0, source: "internal" }));
    expect(await screen.findByText("이 주제에는 이 출처의 글이 없습니다.")).toBeInTheDocument();
  });
});
