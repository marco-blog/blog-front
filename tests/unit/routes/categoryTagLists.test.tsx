// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Blog } from "~/api/models";
import { parseTagName } from "~/blog/listing";
import BlogCategory, {
  loader as categoryLoader,
  meta as categoryMeta,
} from "~/routes/blog-category";
import BlogTag, { loader as blogTagLoader, meta as blogTagMeta } from "~/routes/blog-tag";
import TagPage, { loader as tagLoader, meta as tagMeta } from "~/routes/tag";

import { fail, mockBackend, ok } from "../support/backend";
import { blog as baseBlog, postSummary } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type Args<F extends (...args: never[]) => unknown> = Parameters<F>[0];
type CategoryData = Awaited<ReturnType<typeof categoryLoader>>;
type BlogTagData = Awaited<ReturnType<typeof blogTagLoader>>;
type TagData = Awaited<ReturnType<typeof tagLoader>>;

const blog: Blog = {
  ...baseBlog,
  categories: [
    {
      id: 12,
      name: "Spring",
      postCount: 3,
      children: [{ id: 13, name: "JPA", postCount: 1, children: [] }],
    },
    { id: 20, name: "일상", postCount: 0, children: [] },
  ],
};
const BLOG = "GET /api/v1/blogs/marco";
const POSTS = "GET /api/v1/blogs/marco/posts";
const metaMatches = [{ id: "root", loaderData: rootData("ko") }];

describe("parseTagName", () => {
  it("backend와 같은 규칙으로 정규화하고, 태그가 될 수 없으면 null", () => {
    expect(parseTagName(" Spring Boot ")).toBe("spring boot");
    expect(parseTagName("")).toBeNull();
    expect(parseTagName(undefined)).toBeNull();
    expect(parseTagName("a".repeat(31))).toBeNull();
  });
});

describe("/:handle/category/:categoryId", () => {
  const call = (path: string, categoryId: string, handle = "marco") =>
    categoryLoader(
      routeArgs<Args<typeof categoryLoader>>(getRequest(path), { handle, categoryId }),
    );

  it("블로그와 ?category= 글 목록(page는 0부터)을 SSR로 불러온다", async () => {
    const posts = [postSummary(2, { category: { id: 13, name: "JPA" } })];
    const backend = mockBackend({ [BLOG]: ok(blog), [POSTS]: ok(posts, { totalCount: 21 }) });

    const result = await call("/marco/category/12?page=2", "12");

    expect(result).toMatchObject({
      category: { id: 12, name: "Spring" },
      posts,
      totalCount: 21,
      page: 2,
      pageSize: 20,
    });
    const query = backend.callsTo(POSTS)[0].url.searchParams;
    expect(query.get("category")).toBe("12");
    expect(query.get("page")).toBe("1");
  });

  it("하위 카테고리도 찾는다", async () => {
    mockBackend({ [BLOG]: ok(blog), [POSTS]: ok([]) });
    await expect(call("/marco/category/13", "13")).resolves.toMatchObject({
      category: { id: 13, name: "JPA", children: [] },
    });
  });

  it.each([
    ["숫자가 아닌 id", "abc", "marco"],
    ["잘못된 블로그 주소", "12", "Bad"],
  ])("%s는 backend를 부르지 않고 404", async (_name, categoryId, handle) => {
    const backend = mockBackend();
    expect(
      statusOf(await caught(call(`/${handle}/category/${categoryId}`, categoryId, handle))),
    ).toBe(404);
    expect(backend.calls).toHaveLength(0);
  });

  it("없는(다른 블로그) 카테고리는 404", async () => {
    mockBackend({ [BLOG]: ok(blog), [POSTS]: fail(404, "CATEGORY_NOT_FOUND") });
    expect(statusOf(await caught(call("/marco/category/99", "99")))).toBe(404);
  });

  it("backend가 목록을 주더라도 트리에 없는 카테고리면 404", async () => {
    mockBackend({ [BLOG]: ok(blog), [POSTS]: ok([]) });
    expect(statusOf(await caught(call("/marco/category/99", "99")))).toBe(404);
  });

  const data = (page = 1): CategoryData => ({
    blog,
    category: { id: 12, name: "Spring", children: blog.categories[0].children },
    posts: [
      postSummary(2, {
        title: "JPA 글",
        category: { id: 13, name: "JPA" },
        tags: ["jpa", "spring boot"],
      }),
    ],
    totalCount: 25,
    page,
    pageSize: 20,
    origin: "https://blog.java21.net",
  });

  it('meta: "카테고리명 - 블로그 제목"과 canonical', () => {
    const tags = categoryMeta({
      loaderData: data(2),
      matches: metaMatches,
    } as unknown as Args<typeof categoryMeta>);
    expect(tags).toEqual(
      expect.arrayContaining([
        { title: "Spring - 마르코의 블로그" },
        {
          tagName: "link",
          rel: "canonical",
          href: "https://blog.java21.net/marco/category/12?page=2",
        },
      ]),
    );
    expect(
      categoryMeta({ loaderData: undefined, matches: metaMatches } as unknown as Args<
        typeof categoryMeta
      >),
    ).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("meta: 카테고리 RSS와 블로그 RSS·Atom 자동 발견(002 T088)", () => {
    const tags = categoryMeta({
      loaderData: data(),
      matches: metaMatches,
    } as unknown as Args<typeof categoryMeta>);
    expect(tags.filter((tag) => "rel" in tag && tag.rel === "alternate")).toEqual([
      {
        tagName: "link",
        rel: "alternate",
        type: "application/rss+xml",
        title: "Spring - 마르코의 블로그 RSS",
        href: "https://blog.java21.net/marco/category/12/rss",
      },
      {
        tagName: "link",
        rel: "alternate",
        type: "application/rss+xml",
        title: "마르코의 블로그 RSS",
        href: "https://blog.java21.net/marco/rss",
      },
      {
        tagName: "link",
        rel: "alternate",
        type: "application/atom+xml",
        title: "마르코의 블로그 Atom",
        href: "https://blog.java21.net/marco/atom",
      },
    ]);
  });

  it("화면: 제목, 하위 카테고리, 카테고리·태그 링크가 있는 글 목록, 페이지 이동", async () => {
    renderRoutes(
      [{ path: ":handle/category/:categoryId", loader: () => data(), Component: BlogCategory }],
      { initialEntries: ["/marco/category/12"] },
    );

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Spring");
    const children = screen.getByRole("navigation", { name: "하위 카테고리" });
    expect(within(children).getByRole("link", { name: "JPA (1)" })).toHaveAttribute(
      "href",
      "/marco/category/13",
    );
    // 카테고리 트리(지금 카테고리 표시)는 공개 블로그 레이아웃의 사이드바가 그린다(004, Sidebar.test).
    expect(screen.queryByRole("navigation", { name: "카테고리" })).toBeNull();
    const list = screen.getByRole("list", { name: "글 목록" });
    expect(within(list).getByRole("link", { name: "JPA 글" })).toHaveAttribute("href", "/marco/2");
    expect(within(list).getByRole("link", { name: "JPA" })).toHaveAttribute(
      "href",
      "/marco/category/13",
    );
    expect(within(list).getByRole("link", { name: "#spring boot" })).toHaveAttribute(
      "href",
      "/marco/tags/spring%20boot",
    );
    const pages = screen.getByRole("navigation", { name: "페이지" });
    expect(within(pages).getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/marco/category/12?page=2",
    );
  });

  it("글이 없으면 카테고리 안내", async () => {
    renderRoutes(
      [
        {
          path: ":handle/category/:categoryId",
          loader: () => ({
            ...data(),
            category: { id: 20, name: "일상", children: [] },
            posts: [],
            totalCount: 0,
          }),
          Component: BlogCategory,
        },
      ],
      { initialEntries: ["/marco/category/20"] },
    );
    expect(await screen.findByText("이 카테고리에 공개된 글이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "하위 카테고리" })).toBeNull();
  });
});

describe("/:handle/tags/:name", () => {
  const call = (path: string, name: string, handle = "marco") =>
    blogTagLoader(routeArgs<Args<typeof blogTagLoader>>(getRequest(path), { handle, name }));

  it("태그 이름을 정규화해 ?tag=로 부른다", async () => {
    const backend = mockBackend({
      [BLOG]: ok(blog),
      [POSTS]: ok([postSummary(1)], { totalCount: 1 }),
    });

    const result = await call("/marco/tags/Spring%20Boot", "Spring Boot");

    expect(result).toMatchObject({ tag: "spring boot", totalCount: 1, page: 1 });
    expect(backend.callsTo(POSTS)[0].url.searchParams.get("tag")).toBe("spring boot");
  });

  it("태그가 될 수 없는 이름·잘못된 블로그 주소는 404, 없는 블로그도 404", async () => {
    const backend = mockBackend({
      "GET /api/v1/blogs/nobody": fail(404, "BLOG_NOT_FOUND"),
      "GET /api/v1/blogs/nobody/posts": fail(404, "BLOG_NOT_FOUND"),
    });
    expect(statusOf(await caught(call("/marco/tags/x", "a".repeat(31))))).toBe(404);
    expect(statusOf(await caught(call("/Bad/tags/x", "x", "Bad")))).toBe(404);
    expect(backend.calls).toHaveLength(0);
    expect(statusOf(await caught(call("/nobody/tags/x", "x", "nobody")))).toBe(404);
  });

  const data: BlogTagData = {
    blog,
    tag: "spring boot",
    posts: [postSummary(1, { title: "부트 글", tags: ["spring boot"] })],
    totalCount: 1,
    page: 1,
    pageSize: 20,
    origin: "https://blog.java21.net",
  };

  it("meta: #태그 - 블로그 제목", () => {
    const tags = blogTagMeta({ loaderData: data, matches: metaMatches } as unknown as Args<
      typeof blogTagMeta
    >);
    expect(tags).toEqual(
      expect.arrayContaining([
        { title: "#spring boot - 마르코의 블로그" },
        {
          tagName: "link",
          rel: "canonical",
          href: "https://blog.java21.net/marco/tags/spring%20boot",
        },
      ]),
    );
    expect(
      blogTagMeta({ loaderData: undefined, matches: metaMatches } as unknown as Args<
        typeof blogTagMeta
      >),
    ).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("화면: #태그 제목과 이 블로그 글, 빈 목록 안내", async () => {
    renderRoutes([{ path: ":handle/tags/:name", loader: () => data, Component: BlogTag }], {
      initialEntries: ["/marco/tags/spring%20boot"],
    });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("#spring boot");
    expect(screen.getByRole("link", { name: "부트 글" })).toHaveAttribute("href", "/marco/1");
    expect(screen.getByRole("link", { name: "마르코의 블로그" })).toHaveAttribute("href", "/marco");
  });

  it("빈 목록", async () => {
    renderRoutes(
      [
        {
          path: ":handle/tags/:name",
          loader: () => ({ ...data, posts: [], totalCount: 0 }),
          Component: BlogTag,
        },
      ],
      { initialEntries: ["/marco/tags/none"] },
    );
    expect(await screen.findByText("이 태그가 달린 공개 글이 없습니다.")).toBeInTheDocument();
  });
});

describe("/tags/:name", () => {
  const TAGGED = "GET /api/v1/tags/spring%20boot/posts";
  const call = (path: string, name: string) =>
    tagLoader(routeArgs<Args<typeof tagLoader>>(getRequest(path), { name }));

  it("서비스 전체 태그별 글(SSR, /tags/{name}/posts, page는 0부터)", async () => {
    const posts = [{ ...postSummary(5), blogHandle: "other" }];
    const backend = mockBackend({ [TAGGED]: ok(posts, { totalCount: 41 }) });

    const result = await call("/tags/Spring%20Boot?page=3", "Spring Boot");

    expect(result).toEqual({
      tag: "spring boot",
      posts,
      totalCount: 41,
      page: 3,
      pageSize: 20,
      origin: "http://front.test",
    });
    expect(backend.callsTo(TAGGED)[0].url.searchParams.get("page")).toBe("2");
  });

  it("태그가 될 수 없는 이름은 404, backend 오류는 상태 코드 그대로", async () => {
    mockBackend({ [TAGGED]: fail(500, "INTERNAL_ERROR") });
    expect(statusOf(await caught(call("/tags/%20", " ")))).toBe(404);
    expect(statusOf(await caught(call("/tags/spring%20boot", "spring boot")))).toBe(500);
  });

  const data: TagData = {
    tag: "spring boot",
    posts: [
      { ...postSummary(5, { title: "남의 글", tags: ["spring boot"] }), blogHandle: "other" },
      {
        ...postSummary(6, { title: "내 글", category: { id: 12, name: "Spring" } }),
        blogHandle: "marco",
      },
    ],
    totalCount: 2,
    page: 1,
    pageSize: 20,
    origin: "https://blog.java21.net",
  };

  it('meta: "#태그 - 서비스명"', () => {
    const tags = tagMeta({ loaderData: data, matches: metaMatches } as unknown as Args<
      typeof tagMeta
    >);
    expect(tags).toEqual(
      expect.arrayContaining([
        { title: "#spring boot - 블로그" },
        { property: "og:url", content: "https://blog.java21.net/tags/spring%20boot" },
      ]),
    );
    expect(
      tagMeta({ loaderData: undefined, matches: metaMatches } as unknown as Args<typeof tagMeta>),
    ).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("화면: 각 글은 그 글의 블로그로, 태그는 서비스 전체 태그 목록으로", async () => {
    renderRoutes([{ path: "tags/:name", loader: () => data, Component: TagPage }], {
      initialEntries: ["/tags/spring%20boot"],
    });

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("#spring boot");
    expect(screen.getByRole("link", { name: "남의 글" })).toHaveAttribute("href", "/other/5");
    expect(screen.getByRole("link", { name: "내 글" })).toHaveAttribute("href", "/marco/6");
    expect(screen.getByRole("link", { name: "Spring" })).toHaveAttribute(
      "href",
      "/marco/category/12",
    );
    expect(screen.getByRole("link", { name: "#spring boot" })).toHaveAttribute(
      "href",
      "/tags/spring%20boot",
    );
  });

  it("빈 목록", async () => {
    renderRoutes(
      [
        {
          path: "tags/:name",
          loader: () => ({ ...data, posts: [], totalCount: 0 }),
          Component: TagPage,
        },
      ],
      { initialEntries: ["/tags/none"] },
    );
    expect(await screen.findByText("이 태그가 달린 공개 글이 없습니다.")).toBeInTheDocument();
  });
});
