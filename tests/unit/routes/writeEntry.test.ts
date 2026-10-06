import { describe, expect, it } from "vitest";

import { chooseBlog, readLastBlog } from "~/auth/lastBlog.server";
import { loader } from "~/routes/write-entry";

import { fail, mockBackend, ok } from "../support/backend";
import { caught, expectRedirect, getRequest, routeArgs } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];

const me = (handles: string[]) => ({
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: handles.map((handle) => ({ handle, title: handle })),
  unseenReleaseNote: null,
});

async function target(handles: string[], cookie = "access_token=a") {
  mockBackend({ "GET /api/v1/me": ok(me(handles)) });
  return expectRedirect(
    await caught(loader(routeArgs<LoaderArgs>(getRequest("/write", { cookie })))),
  );
}

/** 상단 "글쓰기" 진입점(contracts/routes.md `/write`) */
describe("/write", () => {
  it("블로그가 1개면 그 블로그의 글쓰기로", async () => {
    expect(await target(["marco"], "access_token=a; last_blog=other")).toBe("/marco/write");
  });

  it("여러 개면 쿠키 last_blog가 내 블로그일 때 그 블로그로", async () => {
    expect(await target(["marco", "marco-dev"], "access_token=a; last_blog=marco-dev")).toBe(
      "/marco-dev/write",
    );
  });

  it("last_blog가 내 블로그가 아니거나 없으면 /settings/blogs(블로그 선택)", async () => {
    expect(await target(["marco", "marco-dev"], "access_token=a; last_blog=someone")).toBe(
      "/settings/blogs",
    );
    expect(await target(["marco", "marco-dev"])).toBe("/settings/blogs");
  });

  it("비로그인은 /login?next=/write", async () => {
    mockBackend({ "GET /api/v1/me": fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(loader(routeArgs<LoaderArgs>(getRequest("/write", { cookie: "lang=ko" })))),
    );

    expect(location).toBe("/login?next=%2Fwrite");
    expect(new URL(location, "http://front.test").searchParams.get("next")).toBe("/write");
  });
});

describe("chooseBlog", () => {
  it("블로그가 없으면 고르지 않는다", () => {
    expect(chooseBlog([], "marco")).toBeNull();
  });
});

describe("readLastBlog", () => {
  it("쿠키 last_blog를 읽는다", () => {
    expect(readLastBlog(getRequest("/", { cookie: "a=1; last_blog=marco-dev" }))).toBe("marco-dev");
    expect(readLastBlog(getRequest("/"))).toBeNull();
  });
});
