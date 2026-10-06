// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FeedPost } from "~/api/models";
import FeedPage, { loader, meta } from "~/routes/feed";

import { fail, mockBackend, ok } from "../support/backend";
import { postSummary } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, expectRedirect, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const ME = "GET /api/v1/me";
const FEED = "GET /api/v1/me/feed";
const me = {
  userId: 2,
  email: "reader@example.com",
  nickname: "독자",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "reader", title: "독자 블로그" }],
  unseenReleaseNote: null,
  unreadNotificationCount: 0,
};

function feedPost(id: number, handle: string, title: string): FeedPost {
  return {
    ...postSummary(id, { title: `${title} ${id}` }),
    blog: { handle, title: `${handle} 블로그` },
    author: { nickname: handle, profileImageUrl: null },
  };
}

const callLoader = (path: string, headers: Record<string, string> = { cookie: "access_token=a" }) =>
  loader(routeArgs<LoaderArgs>(getRequest(path, headers)));

/** 구독 피드(T029, 002 FR-032) */
describe("feed loader", () => {
  it("비로그인은 /login?next=/feed", async () => {
    const backend = mockBackend();

    expect(expectRedirect(await caught(callLoader("/feed", {})))).toBe("/login?next=%2Ffeed");
    expect(backend.calls).toHaveLength(0);
  });

  it("/me/feed?page=(0부터)를 부른다", async () => {
    const posts = [feedPost(2, "marco", "글"), feedPost(1, "third", "글")];
    const backend = mockBackend({ [ME]: ok(me), [FEED]: ok(posts, { totalCount: 41 }) });

    const result = await callLoader("/feed?page=3");

    expect(result).toEqual({ posts, totalCount: 41, page: 3, pageSize: 20 });
    const url = backend.callsTo(FEED)[0].url;
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("size")).toBe("20");
  });

  it("backend 오류는 오류 응답으로", async () => {
    mockBackend({ [ME]: ok(me), [FEED]: fail(500, "INTERNAL_ERROR") });

    expect(statusOf(await caught(callLoader("/feed")))).toBe(500);
  });
});

describe("feed meta", () => {
  it("noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("en") }] } as never;
    expect(meta(args)).toEqual([
      { title: "Subscription feed - Blog" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("feed 화면", () => {
  function renderFeed(data: LoaderData) {
    return renderRoutes([{ path: "feed", loader: () => data, Component: FeedPage }], {
      initialEntries: ["/feed"],
      user: { userId: 2, nickname: "독자", role: "USER" },
    });
  }

  it("글마다 블로그 이름(블로그 홈 링크)·제목(글 링크)·요약·발행일", async () => {
    renderFeed({
      posts: [feedPost(2, "marco", "마르코 글"), feedPost(1, "third", "서드 글")],
      totalCount: 2,
      page: 1,
      pageSize: 20,
    });

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("구독 피드");
    const list = screen.getByRole("list", { name: "글 목록" });
    const items = within(list).getAllByRole("article");
    expect(within(items[0]).getByRole("link", { name: "marco 블로그" })).toHaveAttribute(
      "href",
      "/marco",
    );
    expect(within(items[0]).getByRole("link", { name: "마르코 글 2" })).toHaveAttribute(
      "href",
      "/marco/2",
    );
    expect(items[0]).toHaveTextContent("요약 2");
    expect(within(items[0]).getByText("2026년 10월 6일")).toHaveAttribute(
      "dateTime",
      "2026-10-06T04:24:19Z",
    );
    expect(within(items[1]).getByRole("link", { name: "third 블로그" })).toHaveAttribute(
      "href",
      "/third",
    );
    expect(within(items[1]).getByRole("link", { name: "서드 글 1" })).toHaveAttribute(
      "href",
      "/third/1",
    );
  });

  it("비었으면 안내", async () => {
    renderFeed({ posts: [], totalCount: 0, page: 1, pageSize: 20 });

    expect(
      await screen.findByText(
        "구독한 블로그의 글이 아직 없습니다. 마음에 드는 블로그를 구독해 보세요.",
      ),
    ).toBeInTheDocument();
  });

  it("페이지 이동은 /feed?page=", async () => {
    renderFeed({
      posts: Array.from({ length: 20 }, (_, i) => feedPost(40 - i, "marco", "글")),
      totalCount: 45,
      page: 2,
      pageSize: 20,
    });

    const nav = await screen.findByRole("navigation", { name: "페이지" });
    expect(within(nav).getByRole("link", { name: "이전" })).toHaveAttribute("href", "/feed");
    expect(within(nav).getByRole("link", { name: "다음" })).toHaveAttribute("href", "/feed?page=3");
  });
});
