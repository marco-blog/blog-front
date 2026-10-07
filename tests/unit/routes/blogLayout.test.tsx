// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "~/api/client.server";
import type { SidebarView } from "~/api/models";

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

const SIDEBAR = "GET /api/v1/blogs/marco/sidebar";
const VISITS = "POST /api/v1/blogs/marco/visits";

const sidebarView: SidebarView = {
  items: ["PROFILE", "VISITORS", "CATEGORIES"],
  recentPosts: null,
  popularPosts: null,
  recentComments: null,
  tags: null,
  archive: null,
  visitors: { today: 12, yesterday: 30, total: 1520 },
};

describe("공개 블로그 레이아웃 loader", () => {
  it("블로그·사이드바를 읽고 방문을 기록한다(방명록 기본 켜짐)", async () => {
    const backend = mockBackend({
      [BLOG]: ok(blog),
      [SIDEBAR]: ok(sidebarView),
      [VISITS]: ok(null),
    });

    await expect(callLoader()).resolves.toEqual({
      blog: {
        handle: "marco",
        title: blog.title,
        description: blog.description,
        owner: blog.owner,
        categories: blog.categories,
        guestbookEnabled: true,
      },
      sidebar: sidebarView,
    });
    expect(backend.callsTo(VISITS)).toHaveLength(1);
    expect(backend.callsTo(VISITS)[0].headers.get("origin")).toBe("http://front.test");
  });

  it("세 요청을 함께 보낸다(앞 요청을 기다리지 않음)", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const backend = mockBackend({
      [BLOG]: async () => {
        await gate;
        return ok(blog);
      },
      [SIDEBAR]: ok(sidebarView),
      [VISITS]: ok(null),
    });

    const pending = callLoader();
    await vi.waitFor(() => expect(backend.calls).toHaveLength(3));
    release();
    await pending;
  });

  it("방문 기록·사이드바가 실패해도 화면은 그린다(사이드바 null)", async () => {
    mockBackend({
      [BLOG]: ok(blog),
      [SIDEBAR]: fail(500, "INTERNAL_ERROR"),
      [VISITS]: fail(500, "INTERNAL_ERROR"),
    });

    await expect(callLoader()).resolves.toMatchObject({ sidebar: null, blog: { handle: "marco" } });
  });

  it("같은 요청에서 자식 화면이 부르는 GET /blogs/{handle}은 한 번만 나간다(요청 메모)", async () => {
    const backend = mockBackend({
      [BLOG]: ok(blog),
      [SIDEBAR]: ok(sidebarView),
      [VISITS]: ok(null),
    });
    const request = getRequest("/marco");

    await Promise.all([
      loader(routeArgs<LoaderArgs>(request, { handle: "marco" })),
      createApiClient(request).get("/blogs/marco"),
    ]);

    expect(backend.callsTo(BLOG)).toHaveLength(1);
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
  const layoutData = (
    overrides: Partial<LoaderData["blog"]> = {},
    sidebar: SidebarView | null = null,
  ) =>
    ({
      blog: {
        handle: "marco",
        title: blog.title,
        description: blog.description,
        owner: blog.owner,
        categories: blog.categories,
        guestbookEnabled: true,
        ...overrides,
      },
      sidebar,
    }) as LoaderData;

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
    renderLayout(layoutData());

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
    renderLayout(layoutData({ guestbookEnabled: false }));

    const nav = await screen.findByRole("navigation", { name: "블로그 메뉴" });
    expect(within(nav).queryByRole("link", { name: "방명록" })).toBeNull();
  });

  it("지금 화면의 메뉴에 aria-current", async () => {
    renderLayout(layoutData(), "/marco/guestbook");

    const nav = await screen.findByRole("navigation", { name: "블로그 메뉴" });
    expect(within(nav).getByRole("link", { name: "방명록" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("방명록 본문")).toBeInTheDocument();
  });
});

describe("공개 블로그 레이아웃 사이드바", () => {
  function renderWith(sidebar: SidebarView | null, path = "/marco") {
    const data = {
      blog: {
        handle: "marco",
        title: blog.title,
        description: blog.description,
        owner: { nickname: "마르코", profileImageUrl: null, bio: "자바 개발자" },
        categories: blog.categories,
        guestbookEnabled: true,
      },
      sidebar,
    } as LoaderData;
    renderRoutes(
      [
        {
          id: "blog-layout",
          loader: () => data,
          Component: BlogLayout,
          children: [
            { path: ":handle", Component: () => <main>홈</main> },
            { path: ":handle/category/:categoryId", Component: () => <main>카테고리</main> },
          ],
        },
      ],
      { initialEntries: [path] },
    );
  }

  it("켜진 항목만 순서대로 그린다", async () => {
    renderWith(sidebarView);

    const aside = await screen.findByRole("complementary", { name: "블로그 사이드바" });
    expect(
      within(aside)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(["프로필", "방문자"]);
    expect(within(aside).getByRole("navigation", { name: "카테고리" })).toBeInTheDocument();
    expect(within(aside).queryByRole("search")).toBeNull();
    const sections = [...aside.children].map((child) => child.textContent ?? "");
    expect(sections[0]).toContain("자바 개발자");
    expect(sections[1]).toContain("1,520");
    expect(sections[2]).toContain("Spring");
  });

  it("카테고리 화면에서는 지금 카테고리에 aria-current", async () => {
    renderWith(sidebarView, "/marco/category/12");

    const tree = await screen.findByRole("navigation", { name: "카테고리" });
    expect(within(tree).getByRole("link", { name: "Spring (3)" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("사이드바를 읽지 못하면 프로필·카테고리·검색·피드만", async () => {
    renderWith(null);

    const aside = await screen.findByRole("complementary", { name: "블로그 사이드바" });
    expect(
      within(aside)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(["프로필", "검색", "피드"]);
    expect(within(aside).getByRole("navigation", { name: "카테고리" })).toBeInTheDocument();
  });
});
