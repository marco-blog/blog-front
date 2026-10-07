// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import routes from "~/routes";
import BlogLayout, { loader, shouldRevalidate } from "~/routes/blog/layout";

import { fail, mockBackend, ok } from "../support/backend";
import { blog } from "../support/fixtures";
import { renderRoutes } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;
type RevalidateArgs = Parameters<typeof shouldRevalidate>[0];

const BLOG = "GET /api/v1/blogs/marco";

const callLoader = (path = "/marco", handle = "marco") =>
  loader(routeArgs<LoaderArgs>(getRequest(path), { handle }));

describe("공개 블로그 레이아웃 라우트(routes.ts)", () => {
  type RouteEntry = { path?: string; file: string; children?: RouteEntry[] };
  const top = routes as unknown as RouteEntry[];
  const layout = top.find((route) => route.file === "routes/blog/layout.tsx");

  it("공개 블로그 화면을 경로 없는 레이아웃으로 감싼다", () => {
    expect(layout?.path).toBeUndefined();
    expect(layout?.children?.map((child) => child.path)).toEqual(
      expect.arrayContaining([
        ":handle",
        ":handle/category/:categoryId",
        ":handle/tags/:name",
        ":handle/guestbook",
        ":handle/:postId",
      ]),
    );
  });

  it("글쓰기·관리는 레이아웃 밖", () => {
    const outside = top.map((route) => route.path);
    expect(outside).toContain(":handle/write/:postId?");
    expect(outside).toContain(":handle/manage");
    expect(layout?.children?.map((child) => child.path)).not.toContain(":handle/manage");
  });

  it("고정 이름 경로는 :handle/:postId보다 앞", () => {
    const paths = layout?.children?.map((child) => child.path) ?? [];
    const postDetail = paths.indexOf(":handle/:postId");
    expect(postDetail).toBe(paths.length - 1);
    expect(paths.indexOf(":handle/guestbook")).toBeLessThan(postDetail);
  });
});

describe("공개 블로그 레이아웃 loader", () => {
  it("GET /blogs/{handle}로 블로그 메뉴 정보를 넘긴다(방명록 기본 켜짐)", async () => {
    mockBackend({ [BLOG]: ok(blog) });

    await expect(callLoader()).resolves.toMatchObject({
      blog: { handle: "marco", title: blog.title, guestbookEnabled: true },
    });
  });

  it("없는 블로그는 404, 주소 규칙에 맞지 않으면 backend를 부르지 않고 404", async () => {
    mockBackend({ "GET /api/v1/blogs/nobody": fail(404, "BLOG_NOT_FOUND") });
    expect(statusOf(await caught(callLoader("/nobody", "nobody")))).toBe(404);

    const backend = mockBackend();
    expect(statusOf(await caught(callLoader("/favicon.ico", "favicon.ico")))).toBe(404);
    expect(backend.calls).toHaveLength(0);
  });
});

describe("공개 블로그 레이아웃 다시 읽기", () => {
  const args = (overrides: Partial<RevalidateArgs>) =>
    ({
      currentParams: { handle: "marco" },
      nextParams: { handle: "marco" },
      defaultShouldRevalidate: true,
      ...overrides,
    }) as RevalidateArgs;

  it("블로그가 바뀌면 다시 읽는다", () => {
    expect(shouldRevalidate(args({ nextParams: { handle: "other" } }))).toBe(true);
  });

  it("같은 블로그 안 이동은 다시 읽지 않는다", () => {
    expect(shouldRevalidate(args({}))).toBe(false);
    expect(shouldRevalidate(args({ formMethod: "GET" }))).toBe(false);
  });

  it("action(방명록·댓글 쓰기) 뒤에는 기본 판단을 따른다", () => {
    expect(shouldRevalidate(args({ formMethod: "POST" }))).toBe(true);
    expect(shouldRevalidate(args({ formMethod: "DELETE", defaultShouldRevalidate: false }))).toBe(
      false,
    );
  });
});

describe("공개 블로그 레이아웃 화면", () => {
  function renderLayout(data: LoaderData, path = "/marco") {
    renderRoutes(
      [
        {
          id: "blog-layout",
          loader: () => data,
          Component: BlogLayout,
          children: [
            { path: ":handle", Component: () => <main>블로그 홈 본문</main> },
            { path: ":handle/guestbook", Component: () => <main>방명록 본문</main> },
          ],
        },
      ],
      { initialEntries: [path] },
    );
  }

  it("블로그 메뉴(홈·공지·방명록·태그)와 자식 화면", async () => {
    renderLayout({
      blog: { handle: "marco", title: blog.title, guestbookEnabled: true },
    } as LoaderData);

    const nav = await screen.findByRole("navigation", { name: "블로그 메뉴" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      [blog.title, "/marco"],
      ["홈", "/marco"],
      ["공지", "/marco/notice"],
      ["방명록", "/marco/guestbook"],
      ["태그", "/marco/tags"],
    ]);
    expect(screen.getByText("블로그 홈 본문")).toBeInTheDocument();
  });

  it("방명록을 끄면 메뉴에 없다", async () => {
    renderLayout({
      blog: { handle: "marco", title: blog.title, guestbookEnabled: false },
    } as LoaderData);

    const nav = await screen.findByRole("navigation", { name: "블로그 메뉴" });
    expect(within(nav).queryByRole("link", { name: "방명록" })).toBeNull();
  });

  it("지금 화면의 메뉴에 aria-current", async () => {
    renderLayout(
      { blog: { handle: "marco", title: blog.title, guestbookEnabled: true } } as LoaderData,
      "/marco/guestbook",
    );

    const nav = await screen.findByRole("navigation", { name: "블로그 메뉴" });
    expect(within(nav).getByRole("link", { name: "방명록" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("방명록 본문")).toBeInTheDocument();
  });
});
