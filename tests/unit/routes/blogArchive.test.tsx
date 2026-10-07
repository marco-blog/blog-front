// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BlogArchive, { loader, meta } from "~/routes/blog-archive";

import { mockBackend, ok } from "../support/backend";
import { blog, postSummary } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const POSTS = "GET /api/v1/blogs/marco/posts";
const call = (year: string, month: string, search = "") =>
  loader(
    routeArgs<LoaderArgs>(getRequest(`/marco/archive/${year}/${month}${search}`), {
      handle: "marco",
      year,
      month,
    }),
  );

describe("월별 보관함", () => {
  it("loader: /blogs/{h}/posts?year=&month=&page=", async () => {
    const backend = mockBackend({
      "GET /api/v1/blogs/marco": ok(blog),
      [POSTS]: ok([postSummary(1)], { totalCount: 1 }),
    });

    const result = await call("2026", "9", "?page=2");

    expect(result).toMatchObject({ yearMonth: { year: 2026, month: 9 }, page: 2, totalCount: 1 });
    const query = backend.callsTo(POSTS)[0].url.searchParams;
    expect([query.get("year"), query.get("month"), query.get("page")]).toEqual(["2026", "9", "1"]);
  });

  it.each([
    ["2026", "13"],
    ["2026", "0"],
    ["abcd", "10"],
    ["1969", "1"],
    ["2026", "x"],
  ])("숫자가 아니거나 범위 밖(%s/%s)이면 backend를 부르지 않고 404", async (year, month) => {
    const backend = mockBackend();
    expect(statusOf(await caught(call(year, month)))).toBe(404);
    expect(backend.calls).toHaveLength(0);
  });

  it.each([
    ["ko", "2026년 10월 - 마르코의 블로그"],
    ["en", "October 2026 - 마르코의 블로그"],
  ] as const)("meta 제목(%s)", (language, title) => {
    const data: LoaderData = {
      blog: { handle: "marco", title: blog.title, description: null },
      yearMonth: { year: 2026, month: 10 },
      posts: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      origin: "https://blog.java21.net",
    };
    const tags = meta({
      loaderData: data,
      matches: [{ id: "root", loaderData: rootData(language) }],
    } as unknown as MetaArgs);
    expect(tags).toContainEqual({ title });
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.java21.net/marco/archive/2026/10",
    });
  });

  it("meta: 오류면 찾을 수 없음", () => {
    expect(
      meta({
        loaderData: undefined,
        matches: [{ id: "root", loaderData: rootData("ko") }],
      } as unknown as MetaArgs)[0],
    ).toEqual({ title: "페이지를 찾을 수 없습니다 - 블로그" });
  });

  it("화면 제목은 화면 언어의 연·월, 글이 없으면 안내", async () => {
    const data: LoaderData = {
      blog: { handle: "marco", title: blog.title, description: null },
      yearMonth: { year: 2026, month: 10 },
      posts: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
    };
    renderRoutes(
      [{ path: ":handle/archive/:year/:month", loader: () => data, Component: BlogArchive }],
      { initialEntries: ["/marco/archive/2026/10"], language: "ja" },
    );
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("2026年10月");
    expect(screen.getByText("まだ公開した記事がありません。")).toBeInTheDocument();
  });
});
