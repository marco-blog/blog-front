// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Blog } from "~/api/models";
import ManageFeed, {
  action,
  FEED_CONTENT_MODES,
  FEED_ITEM_COUNTS,
  loader,
  meta,
} from "~/routes/manage/feed";

import { fail, mockBackend, ok } from "../support/backend";
import { blog } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
  withCookie,
} from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];

const ME = "GET /api/v1/me";
const BLOG = "GET /api/v1/blogs/marco";
const PATCH = "PATCH /api/v1/blogs/marco";
const loggedIn = { cookie: "access_token=a" };

const me = (handles = ["marco"]) => ({
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: handles.map((handle) => ({ handle, title: `${handle} 블로그` })),
  unseenReleaseNote: null,
  unreadNotificationCount: 0,
});

const feedBlog: Blog = {
  ...blog,
  feedItemCount: 10,
  feedContentMode: "SUMMARY",
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

const callLoader = (handle = "marco", headers: Record<string, string> = loggedIn) =>
  loader(routeArgs<LoaderArgs>(getRequest(`/${handle}/manage/feed`, headers), { handle }));

const callAction = (fields: Record<string, string>, handle = "marco") =>
  action(
    routeArgs<ActionArgs>(formRequest(`/${handle}/manage/feed`, fields, loggedIn), { handle }),
  );

/** 피드 설정(T089, 002 FR-046, contracts/routes.md `/:handle/manage/feed`) */
describe("manage feed loader", () => {
  it("현재 설정과 RSS·Atom·카테고리 RSS 절대 주소(하위 카테고리 포함)", async () => {
    mockBackend({ [ME]: ok(me()), [BLOG]: ok(feedBlog) });

    await expect(callLoader()).resolves.toEqual({
      handle: "marco",
      feedItemCount: 10,
      feedContentMode: "SUMMARY",
      rssUrl: "http://front.test/marco/rss",
      atomUrl: "http://front.test/marco/atom",
      categoryFeeds: [
        { id: 12, name: "Spring", url: "http://front.test/marco/category/12/rss" },
        { id: 13, name: "JPA", url: "http://front.test/marco/category/13/rss" },
        { id: 20, name: "일상", url: "http://front.test/marco/category/20/rss" },
      ],
    });
  });

  it("비로그인은 로그인 화면으로, 남의 블로그는 404", async () => {
    mockBackend();
    expect(expectRedirect(await caught(callLoader("marco", {})))).toBe(
      "/login?next=%2Fmarco%2Fmanage%2Ffeed",
    );

    mockBackend({ [ME]: ok(me(["marco"])) });
    expect(statusOf(await caught(callLoader("other")))).toBe(404);
  });
});

describe("manage feed action", () => {
  it("PATCH /blogs/{handle} { feedItemCount, feedContentMode }", async () => {
    const backend = mockBackend({ [ME]: ok(me()), [PATCH]: ok(feedBlog) });

    const result = asData(await callAction({ feedItemCount: "30", feedContentMode: "FULL" }));

    expect(result.data).toEqual({ ok: true });
    expect(backend.callsTo(PATCH)[0].body).toEqual({ feedItemCount: 30, feedContentMode: "FULL" });
  });

  it("값이 없거나 숫자가 아니면 null을 보내 backend가 검사한다", async () => {
    const backend = mockBackend({ [ME]: ok(me()), [PATCH]: ok(feedBlog) });

    await callAction({ feedItemCount: "abc" });

    expect(backend.callsTo(PATCH)[0].body).toEqual({
      feedItemCount: null,
      feedContentMode: null,
    });
  });

  it("INVALID는 입력란 오류로", async () => {
    mockBackend({
      [ME]: ok(me()),
      [PATCH]: fail(400, "VALIDATION_FAILED", [
        { field: "feedItemCount", code: "INVALID", params: { allowed: [10, 20, 30, 50] } },
      ]),
    });

    const result = asData(await callAction({ feedItemCount: "15", feedContentMode: "FULL" }));

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({
      ok: false,
      resultCode: "VALIDATION_FAILED",
      fieldErrors: [{ field: "feedItemCount", code: "INVALID" }],
    });
  });

  it("남의 블로그는 404", async () => {
    mockBackend({ [ME]: ok(me(["marco"])) });
    expect(statusOf(await caught(callAction({ feedItemCount: "10" }, "other")))).toBe(404);
  });
});

describe("manage feed meta", () => {
  it("noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("ko") }] } as never;
    expect(meta(args)).toEqual([
      { title: "피드 설정 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("manage feed 화면", () => {
  function renderFeed(patch = ok(feedBlog)) {
    const backend = mockBackend({ [ME]: ok(me()), [BLOG]: ok(feedBlog), [PATCH]: patch });
    renderRoutes(
      [
        {
          path: ":handle/manage/feed",
          loader: withCookie(loader as never) as never,
          action: withCookie(action as never) as never,
          Component: ManageFeed,
        },
      ],
      { initialEntries: ["/marco/manage/feed"] },
    );
    return backend;
  }

  it("현재 설정(글 수 10·20·30·50, 전문·요약)과 피드 주소 안내", async () => {
    renderFeed();

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("피드 설정");
    const count = screen.getByRole("combobox", { name: "피드에 담을 글 수" });
    expect(count).toHaveValue("10");
    expect(
      within(count)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["10개", "20개", "30개", "50개"]);
    expect(screen.getByRole("radio", { name: "요약" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "전문" })).not.toBeChecked();
    const urls = screen.getByRole("region", { name: "피드 주소" });
    expect(within(urls).getByRole("link", { name: "http://localhost/marco/rss" })).toHaveAttribute(
      "href",
      "http://localhost/marco/rss",
    );
    expect(within(urls).getByRole("link", { name: "http://localhost/marco/atom" })).toBeVisible();
    expect(
      within(urls).getByRole("link", { name: "http://localhost/marco/category/13/rss" }),
    ).toBeVisible();
    expect(FEED_ITEM_COUNTS).toEqual([10, 20, 30, 50]);
    expect(FEED_CONTENT_MODES).toEqual(["FULL", "SUMMARY"]);
  });

  it("저장하면 PATCH하고 저장 안내", async () => {
    const backend = renderFeed();

    fireEvent.change(await screen.findByRole("combobox", { name: "피드에 담을 글 수" }), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "전문" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("status")).toHaveTextContent("피드 설정을 저장했습니다.");
    await waitFor(() =>
      expect(backend.callsTo(PATCH)[0].body).toEqual({
        feedItemCount: 50,
        feedContentMode: "FULL",
      }),
    );
  });

  it("INVALID 문구를 입력란 아래에", async () => {
    renderFeed(
      fail(400, "VALIDATION_FAILED", [
        { field: "feedContentMode", code: "INVALID", params: { allowed: ["FULL", "SUMMARY"] } },
      ]),
    );

    fireEvent.click(await screen.findByRole("button", { name: "저장" }));

    expect(await screen.findByText("올바르지 않은 값입니다.")).toHaveClass("form-error");
  });

  it("카테고리가 없으면 카테고리 RSS 안내가 없다", async () => {
    mockBackend({ [ME]: ok(me()), [BLOG]: ok({ ...feedBlog, categories: [] }) });
    renderRoutes(
      [
        {
          path: ":handle/manage/feed",
          loader: withCookie(loader as never) as never,
          Component: ManageFeed,
        },
      ],
      { initialEntries: ["/marco/manage/feed"] },
    );

    await screen.findByRole("region", { name: "피드 주소" });
    expect(screen.queryByRole("heading", { name: "카테고리 RSS" })).toBeNull();
  });
});
