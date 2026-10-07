// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GuestbookEntry } from "~/api/models";
import Guestbook, { action, loader, meta } from "~/routes/manage/guestbook";

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
type MetaArgs = Parameters<typeof meta>[0];

const ME = "GET /api/v1/me";
const BLOG = "GET /api/v1/blogs/marco";
const LIST = "GET /api/v1/blogs/marco/guestbook";
const loggedIn = { cookie: "access_token=a" };
const me = {
  userId: 1,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
  unseenReleaseNote: null,
};

function entry(id: number, overrides: Partial<GuestbookEntry> = {}): GuestbookEntry {
  return {
    id,
    content: `방명록 ${id}`,
    secret: false,
    deleted: false,
    author: { userId: 42, nickname: "리더", profileImageUrl: null, guest: false },
    createdAt: "2026-10-06T04:24:19Z",
    updatedAt: "2026-10-06T04:24:19Z",
    replies: [],
    ...overrides,
  };
}

describe("방명록 관리 loader·action", () => {
  it("주인 목록(page는 0부터)과 방명록 사용 여부", async () => {
    const entries = [entry(2, { secret: true, content: "비밀 내용" })];
    const backend = mockBackend({
      [ME]: ok(me),
      [BLOG]: ok({ ...blog, guestbookEnabled: false }),
      [LIST]: ok(entries, { totalCount: 1 }),
    });

    const result = await loader(
      routeArgs<LoaderArgs>(getRequest("/marco/manage/guestbook?page=2", loggedIn), {
        handle: "marco",
      }),
    );

    expect(result).toEqual({
      handle: "marco",
      viewerId: 1,
      guestbookEnabled: false,
      entries,
      totalCount: 1,
      page: 2,
    });
    expect(backend.callsTo(LIST)[0].url.searchParams.get("page")).toBe("1");
  });

  it("남의 블로그는 404", async () => {
    mockBackend({ [ME]: ok(me) });
    const thrown = await caught(
      loader(
        routeArgs<LoaderArgs>(getRequest("/other/manage/guestbook", loggedIn), { handle: "other" }),
      ),
    );
    expect(statusOf(thrown)).toBe(404);
  });

  it("backend가 403이면 404", async () => {
    mockBackend({ [ME]: ok(me), [BLOG]: ok(blog), [LIST]: fail(403, "FORBIDDEN") });
    const thrown = await caught(
      loader(
        routeArgs<LoaderArgs>(getRequest("/marco/manage/guestbook", loggedIn), { handle: "marco" }),
      ),
    );
    expect(statusOf(thrown)).toBe(404);
  });

  it("답글·삭제 action 후 같은 쪽으로", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      "POST /api/v1/blogs/marco/guestbook": ok(entry(3), { status: 201 }),
      "DELETE /api/v1/guestbook-entries/2": ok(null),
    });
    const call = (fields: Record<string, string>) =>
      action(
        routeArgs<ActionArgs>(formRequest("/marco/manage/guestbook?page=2", fields, loggedIn), {
          handle: "marco",
        }),
      );

    expect(
      expectRedirect(await caught(call({ intent: "reply", parentId: "2", content: "고마워요" }))),
    ).toBe("/marco/manage/guestbook?page=2");
    expect(expectRedirect(await caught(call({ intent: "delete", entryId: "2" })))).toBe(
      "/marco/manage/guestbook?page=2",
    );
    expect(backend.callsTo("POST /api/v1/blogs/marco/guestbook")[0].body).toEqual({
      content: "고마워요",
      parentId: 2,
    });
    expect(asData(await call({ intent: "create", content: "주인 글" })).init?.status).toBe(400);
  });

  it("meta는 noindex", () => {
    const tags = meta({
      matches: [{ id: "root", loaderData: rootData("ko") }],
    } as unknown as MetaArgs);
    expect(tags).toEqual([
      { title: "방명록 관리 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("방명록 관리 화면", () => {
  function renderPage(routes: Record<string, Response>) {
    mockBackend({ [ME]: ok(me), ...routes });
    renderRoutes(
      [
        {
          path: ":handle/manage/guestbook",
          loader: withCookie(loader as never) as never,
          action: withCookie(action as never) as never,
          Component: Guestbook,
        },
      ],
      { initialEntries: ["/marco/manage/guestbook"] },
    );
  }

  it("주인은 비밀글 내용을 보고 답글·삭제를 할 수 있다", async () => {
    renderPage({
      [BLOG]: ok(blog),
      [LIST]: ok([entry(2, { secret: true, content: "비밀 내용" })], { totalCount: 1 }),
    });

    const list = await screen.findByRole("list", { name: "방명록 글 목록" });
    expect(within(list).getByText("비밀 내용")).toBeInTheDocument();
    expect(within(list).getByText("답글 달기")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("방명록이 꺼져 있으면 안내와 설정 링크", async () => {
    renderPage({
      [BLOG]: ok({ ...blog, guestbookEnabled: false }),
      [LIST]: ok([], { totalCount: 0 }),
    });

    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("방명록이 꺼져 있어 방문자에게 보이지 않습니다.");
    expect(within(note).getByRole("link", { name: "블로그 설정에서 켜기" })).toHaveAttribute(
      "href",
      "/marco/manage/settings",
    );
  });
});
