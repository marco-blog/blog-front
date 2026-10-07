// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import BlogTags, { loader, meta } from "~/routes/blog-tags";

import { fail, mockBackend, ok } from "../support/backend";
import { blog } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

describe("블로그 태그 목록", () => {
  it("loader: /blogs/{h}/tags", async () => {
    mockBackend({
      "GET /api/v1/blogs/marco": ok(blog),
      "GET /api/v1/blogs/marco/tags": ok([{ name: "spring", postCount: 3 }]),
    });
    await expect(
      loader(routeArgs<LoaderArgs>(getRequest("/marco/tags"), { handle: "marco" })),
    ).resolves.toMatchObject({ tags: [{ name: "spring", postCount: 3 }] });
  });

  it("없는 블로그·잘못된 주소는 404", async () => {
    mockBackend({
      "GET /api/v1/blogs/nobody": fail(404, "BLOG_NOT_FOUND"),
      "GET /api/v1/blogs/nobody/tags": fail(404, "BLOG_NOT_FOUND"),
    });
    expect(
      statusOf(
        await caught(
          loader(routeArgs<LoaderArgs>(getRequest("/nobody/tags"), { handle: "nobody" })),
        ),
      ),
    ).toBe(404);
    expect(
      statusOf(await caught(loader(routeArgs<LoaderArgs>(getRequest("/X/tags"), { handle: "X" })))),
    ).toBe(404);
  });

  it("meta: {태그} - {블로그 제목}", () => {
    const args = (loaderData: LoaderData | undefined) =>
      ({
        loaderData,
        matches: [{ id: "root", loaderData: rootData("ko") }],
      }) as unknown as MetaArgs;
    expect(
      meta(
        args({
          blog: { handle: "marco", title: blog.title, description: null },
          tags: [],
          origin: "https://b.test",
        }),
      ),
    ).toContainEqual({ title: "태그 - 마르코의 블로그" });
    expect(meta(args(undefined))[0]).toEqual({ title: "페이지를 찾을 수 없습니다 - 블로그" });
  });

  function renderTags(tags: LoaderData["tags"]) {
    const data: LoaderData = {
      blog: { handle: "marco", title: blog.title, description: null },
      tags,
      origin: "http://front.test",
    };
    renderRoutes([{ path: ":handle/tags", loader: () => data, Component: BlogTags }], {
      initialEntries: ["/marco/tags"],
    });
  }

  it("이름순, 글 수에 따른 크기 단계, 블로그 태그 링크", async () => {
    renderTags([
      { name: "spring", postCount: 14 },
      { name: "aws", postCount: 1 },
      { name: "jpa", postCount: 4 },
    ]);

    const list = await screen.findByRole("list", { name: "태그 목록" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["#aws (1)", "#jpa (4)", "#spring (14)"]);
    expect(items.map((item) => item.className)).toEqual([
      "tag-weight-1",
      "tag-weight-3",
      "tag-weight-5",
    ]);
    expect(within(list).getByRole("link", { name: /#jpa/ })).toHaveAttribute(
      "href",
      "/marco/tags/jpa",
    );
  });

  it("태그가 없으면 안내", async () => {
    renderTags([]);
    expect(await screen.findByText("아직 태그가 없습니다.")).toBeInTheDocument();
  });
});
