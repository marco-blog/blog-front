// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BlogNotice, { loader, meta } from "~/routes/blog-notice";

import { fail, mockBackend, ok } from "../support/backend";
import { blog, postSummary } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const NOTICES = "GET /api/v1/blogs/marco/notices";

describe("공지 목록", () => {
  it("loader: /blogs/{h}/notices?page=(0부터)&size=20", async () => {
    const backend = mockBackend({
      "GET /api/v1/blogs/marco": ok(blog),
      [NOTICES]: ok([postSummary(3, { notice: true })], { totalCount: 21 }),
    });

    const result = await loader(
      routeArgs<LoaderArgs>(getRequest("/marco/notice?page=2"), { handle: "marco" }),
    );

    expect(result).toMatchObject({ totalCount: 21, page: 2, pageSize: 20 });
    const query = backend.callsTo(NOTICES)[0].url.searchParams;
    expect([query.get("page"), query.get("size")]).toEqual(["1", "20"]);
  });

  it("없는 블로그·잘못된 주소는 404", async () => {
    mockBackend({
      "GET /api/v1/blogs/nobody": fail(404, "BLOG_NOT_FOUND"),
      "GET /api/v1/blogs/nobody/notices": fail(404, "BLOG_NOT_FOUND"),
    });
    expect(
      statusOf(
        await caught(
          loader(routeArgs<LoaderArgs>(getRequest("/nobody/notice"), { handle: "nobody" })),
        ),
      ),
    ).toBe(404);
    expect(
      statusOf(
        await caught(loader(routeArgs<LoaderArgs>(getRequest("/Bad/notice"), { handle: "Bad" }))),
      ),
    ).toBe(404);
  });

  it("meta: {공지} - {블로그 제목}", () => {
    const data = {
      blog: { handle: "marco", title: blog.title, description: null },
      posts: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      origin: "https://blog.java21.net",
    } satisfies LoaderData;
    const args = (loaderData: LoaderData | undefined) =>
      ({
        loaderData,
        matches: [{ id: "root", loaderData: rootData("ko") }],
      }) as unknown as MetaArgs;
    expect(meta(args(data))).toContainEqual({ title: "공지 - 마르코의 블로그" });
    expect(meta(args(undefined))[0]).toEqual({ title: "페이지를 찾을 수 없습니다 - 블로그" });
  });

  it("화면: 공지 글 목록, 없으면 안내", async () => {
    const data: LoaderData = {
      blog: { handle: "marco", title: blog.title, description: null },
      posts: [postSummary(3, { title: "운영 공지", notice: true })],
      totalCount: 1,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
    };
    renderRoutes([{ path: ":handle/notice", loader: () => data, Component: BlogNotice }], {
      initialEntries: ["/marco/notice"],
    });

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("공지");
    expect(
      within(screen.getByRole("list", { name: "글 목록" })).getByRole("link", {
        name: "운영 공지",
      }),
    ).toHaveAttribute("href", "/marco/3");
  });
});
