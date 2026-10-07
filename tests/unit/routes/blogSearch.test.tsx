// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BlogSearch, { blogSearchHref, loader, meta } from "~/routes/blog-search";

import { fail, mockBackend, ok } from "../support/backend";
import { blog, postSummary } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const SEARCH = "GET /api/v1/search/posts";
const call = (search: string, handle = "marco") =>
  loader(routeArgs<LoaderArgs>(getRequest(`/${handle}/search${search}`), { handle }));

describe("블로그 안 검색", () => {
  it("loader: /search/posts?blog=&q=&page=(0부터)", async () => {
    const backend = mockBackend({
      "GET /api/v1/blogs/marco": ok(blog),
      [SEARCH]: ok([{ ...postSummary(1), blog: { handle: "marco", title: blog.title } }], {
        totalCount: 1,
      }),
    });

    const result = await call("?q=spring&page=2");

    expect(result).toMatchObject({ q: "spring", searched: true, totalCount: 1, page: 2 });
    const query = backend.callsTo(SEARCH)[0].url.searchParams;
    expect([query.get("blog"), query.get("q"), query.get("page")]).toEqual([
      "marco",
      "spring",
      "1",
    ]);
  });

  it("검색어가 비면 API를 부르지 않는다", async () => {
    const backend = mockBackend({ "GET /api/v1/blogs/marco": ok(blog) });
    expect(await call("?q=%20")).toMatchObject({ q: "", searched: false });
    expect(backend.callsTo(SEARCH)).toHaveLength(0);
  });

  it("2자 미만·100자 초과는 입력란 오류", async () => {
    mockBackend({
      "GET /api/v1/blogs/marco": ok(blog),
      [SEARCH]: fail(400, "VALIDATION_FAILED", [
        { field: "q", code: "TOO_SHORT", params: { min: 2 } },
      ]),
    });
    expect(await call("?q=a")).toMatchObject({
      searched: false,
      fieldErrors: [{ field: "q", code: "TOO_SHORT", params: { min: 2 } }],
    });
  });

  it("볼 수 없는 블로그는 404, 그 밖의 오류는 상태 그대로", async () => {
    mockBackend({ "GET /api/v1/blogs/nobody": fail(404, "BLOG_NOT_FOUND") });
    expect(statusOf(await caught(call("?q=spring", "nobody")))).toBe(404);
    expect(statusOf(await caught(call("?q=spring", "Bad")))).toBe(404);
    mockBackend({ "GET /api/v1/blogs/marco": ok(blog), [SEARCH]: fail(500, "INTERNAL_ERROR") });
    expect(statusOf(await caught(call("?q=spring")))).toBe(500);
  });

  it("주소: 첫 쪽은 page 없음", () => {
    expect(blogSearchHref("marco", "스프링 부트")).toBe(
      "/marco/search?q=%EC%8A%A4%ED%94%84%EB%A7%81+%EB%B6%80%ED%8A%B8",
    );
    expect(blogSearchHref("marco", "a", 3)).toBe("/marco/search?q=a&page=3");
  });

  it("meta는 noindex", () => {
    const args = (loaderData: Partial<LoaderData> | undefined) =>
      ({
        loaderData,
        matches: [{ id: "root", loaderData: rootData("ko") }],
      }) as unknown as MetaArgs;
    expect(meta(args({ q: "spring", blog: { handle: "marco", title: blog.title } }))).toEqual([
      { title: "spring - 마르코의 블로그 검색 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
    expect(meta(args({ q: "", blog: { handle: "marco", title: blog.title } }))[0]).toEqual({
      title: "블로그 검색 - 마르코의 블로그 - 블로그",
    });
    expect(meta(args(undefined))[1]).toEqual({ name: "robots", content: "noindex" });
  });

  function renderSearch(data: Partial<LoaderData>) {
    const loaderData: LoaderData = {
      blog: { handle: "marco", title: blog.title },
      q: "",
      page: 1,
      pageSize: 20,
      posts: [],
      totalCount: 0,
      searched: false,
      fieldErrors: [],
      ...data,
    };
    renderRoutes([{ path: ":handle/search", loader: () => loaderData, Component: BlogSearch }], {
      initialEntries: ["/marco/search"],
    });
  }

  it("화면: 검색 결과(보호 글은 요약 없이 제목만)", async () => {
    renderSearch({
      q: "spring",
      searched: true,
      totalCount: 1,
      posts: [
        {
          ...postSummary(5, { title: "보호 글", summary: null, visibility: "PROTECTED" }),
          blog: { handle: "marco", title: blog.title },
        },
      ],
    });
    const search = await screen.findByRole("search");
    expect(search).toHaveAttribute("action", "/marco/search");
    expect(within(search).getByLabelText("이 블로그에서 검색")).toHaveValue("spring");
    const list = screen.getByRole("list", { name: "글 목록" });
    expect(within(list).getByRole("link", { name: "보호 글" })).toHaveAttribute("href", "/marco/5");
  });

  it("화면: 입력 오류 문구", async () => {
    renderSearch({ q: "a", fieldErrors: [{ field: "q", code: "TOO_SHORT", params: { min: 2 } }] });
    expect(await screen.findByText("2자 이상 입력해 주세요.")).toBeInTheDocument();
  });
});
