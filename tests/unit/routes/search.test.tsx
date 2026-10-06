// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SearchPost } from "~/api/models";
import SearchPage, { loader, meta, searchHref } from "~/routes/search";

import { fail, mockBackend, ok } from "../support/backend";
import { postSummary } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const SEARCH = "GET /api/v1/search/posts";

function searchPost(id: number, handle: string, overrides: Partial<SearchPost> = {}): SearchPost {
  return {
    ...postSummary(id, { title: `검색 글 ${id}` }),
    blog: { handle, title: `${handle} 블로그` },
    ...overrides,
  };
}

const callLoader = (path: string) => loader(routeArgs<LoaderArgs>(getRequest(path)));

/** 서비스 전체 검색(T065, 002 FR-035, contracts/routes.md `/search`) */
describe("search loader", () => {
  it("q가 없거나 공백뿐이면 API를 부르지 않는다", async () => {
    const backend = mockBackend();

    for (const path of ["/search", "/search?q=", "/search?q=%20%20"]) {
      expect(await callLoader(path)).toMatchObject({
        q: "",
        searched: false,
        posts: [],
        totalCount: 0,
        fieldErrors: [],
      });
    }
    expect(backend.calls).toHaveLength(0);
  });

  it("/search/posts?q=&page=(0부터)&size=20을 부른다", async () => {
    const posts = [searchPost(2, "marco"), searchPost(1, "third")];
    const backend = mockBackend({ [SEARCH]: ok(posts, { totalCount: 41 }) });

    const result = await callLoader("/search?q=%20%EC%8A%A4%ED%94%84%EB%A7%81%20jpa%20&page=3");

    expect(result).toEqual({
      q: "스프링 jpa",
      page: 3,
      pageSize: 20,
      posts,
      totalCount: 41,
      searched: true,
      fieldErrors: [],
    });
    const url = backend.callsTo(SEARCH)[0].url;
    expect(url.searchParams.get("q")).toBe("스프링 jpa");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("size")).toBe("20");
  });

  it("검색어 검증 오류(400)는 입력란 오류로 돌려준다", async () => {
    mockBackend({
      [SEARCH]: fail(400, "VALIDATION_FAILED", [
        { field: "q", code: "TOO_SHORT", params: { min: 2 } },
      ]),
    });

    expect(await callLoader("/search?q=a")).toMatchObject({
      q: "a",
      searched: false,
      posts: [],
      fieldErrors: [{ field: "q", code: "TOO_SHORT", params: { min: 2 } }],
    });
  });

  it("그 밖의 backend 오류는 오류 응답으로", async () => {
    mockBackend({ [SEARCH]: fail(500, "INTERNAL_ERROR") });
    expect(statusOf(await caught(callLoader("/search?q=jpa")))).toBe(500);

    mockBackend({ [SEARCH]: fail(400, "VALIDATION_FAILED") });
    expect(statusOf(await caught(callLoader("/search?q=jpa")))).toBe(400);
  });
});

describe("search meta", () => {
  const args = (loaderData: Partial<LoaderData> | undefined, language: "ko" | "en" = "ko") =>
    ({
      loaderData,
      matches: [{ id: "root", loaderData: rootData(language) }],
    }) as unknown as MetaArgs;

  it('"{q}" 검색 - 서비스명, noindex', () => {
    expect(meta(args({ q: "스프링" }))).toEqual([
      { title: '"스프링" 검색 - 블로그' },
      { name: "robots", content: "noindex" },
    ]);
    expect(meta(args({ q: "jpa" }, "en"))).toEqual([
      { title: 'Search for "jpa" - Blog' },
      { name: "robots", content: "noindex" },
    ]);
  });

  it("검색어가 없으면 검색 - 서비스명", () => {
    expect(meta(args({ q: "" }))).toEqual([
      { title: "검색 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
    expect(meta(args(undefined))[0]).toEqual({ title: "검색 - 블로그" });
  });
});

describe("search 화면", () => {
  const loaded = (overrides: Partial<LoaderData> = {}): LoaderData => ({
    q: "스프링",
    page: 1,
    pageSize: 20,
    posts: [],
    totalCount: 0,
    searched: true,
    fieldErrors: [],
    ...overrides,
  });

  function renderSearch(data: LoaderData, entry = "/search?q=%EC%8A%A4%ED%94%84%EB%A7%81") {
    return renderRoutes([{ path: "search", loader: () => data, Component: SearchPage }], {
      initialEntries: [entry],
    });
  }

  it("q가 없으면 검색창만", async () => {
    renderSearch(loaded({ q: "", searched: false }), "/search");

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("검색");
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/search");
    expect(within(form).getByRole("searchbox", { name: "검색어" })).toHaveValue("");
    expect(screen.queryByRole("region", { name: "검색 결과" })).toBeNull();
  });

  it("결과: 블로그 이름(블로그 홈 링크)·제목(글 링크)·요약·발행일, 요약이 없으면 제목만", async () => {
    renderSearch(
      loaded({
        posts: [
          searchPost(2, "marco", { title: "스프링 부트" }),
          searchPost(1, "third", { title: "보호 글", summary: null }),
        ],
        totalCount: 2,
      }),
    );

    const results = await screen.findByRole("region", { name: "검색 결과" });
    expect(results).toHaveTextContent("검색 결과 2건");
    const items = within(results).getAllByRole("article");
    expect(within(items[0]).getByRole("link", { name: "marco 블로그" })).toHaveAttribute(
      "href",
      "/marco",
    );
    expect(within(items[0]).getByRole("link", { name: "스프링 부트" })).toHaveAttribute(
      "href",
      "/marco/2",
    );
    expect(items[0]).toHaveTextContent("요약 2");
    expect(within(items[0]).getByText("2026년 10월 6일")).toHaveAttribute(
      "dateTime",
      "2026-10-06T04:24:19Z",
    );
    expect(within(items[1]).getByRole("link", { name: "보호 글" })).toHaveAttribute(
      "href",
      "/third/1",
    );
    expect(items[1]).not.toHaveTextContent("요약 1");
    expect(screen.getByRole("searchbox", { name: "검색어" })).toHaveValue("스프링");
  });

  it.each([
    ["TOO_SHORT", { min: 2 }, "2자 이상 입력해 주세요."],
    ["TOO_LONG", { max: 100 }, "100자 이하로 입력해 주세요."],
  ])("%s는 검색창 아래 문구", async (code, params, message) => {
    renderSearch(loaded({ q: "a", searched: false, fieldErrors: [{ field: "q", code, params }] }));

    const input = await screen.findByRole("searchbox", { name: "검색어" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(screen.queryByRole("region", { name: "검색 결과" })).toBeNull();
  });

  it("결과가 없으면 안내", async () => {
    renderSearch(loaded());

    expect(
      await screen.findByText("검색 결과가 없습니다. 다른 낱말로 찾아보세요."),
    ).toBeInTheDocument();
    expect(screen.getByText("검색 결과 0건")).toBeInTheDocument();
  });

  it("페이지 이동은 q를 유지한다", async () => {
    renderSearch(
      loaded({
        q: "스프링 jpa",
        page: 2,
        totalCount: 45,
        posts: Array.from({ length: 20 }, (_, i) => searchPost(40 - i, "marco")),
      }),
    );

    const nav = await screen.findByRole("navigation", { name: "페이지" });
    expect(within(nav).getByRole("link", { name: "이전" })).toHaveAttribute(
      "href",
      "/search?q=%EC%8A%A4%ED%94%84%EB%A7%81+jpa",
    );
    expect(within(nav).getByRole("link", { name: "다음" })).toHaveAttribute(
      "href",
      "/search?q=%EC%8A%A4%ED%94%84%EB%A7%81+jpa&page=3",
    );
  });

  it("searchHref", () => {
    expect(searchHref("a b")).toBe("/search?q=a+b");
    expect(searchHref("a&b", 1)).toBe("/search?q=a%26b");
    expect(searchHref("x", 4)).toBe("/search?q=x&page=4");
  });
});
