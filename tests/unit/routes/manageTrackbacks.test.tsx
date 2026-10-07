// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ManagedTrackback } from "~/api/models";
import Layout, { loader as layoutLoader } from "~/routes/manage/layout";
import Trackbacks, { action, loader, manageTrackbacksHref, meta } from "~/routes/manage/trackbacks";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
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

/** 받은 트랙백 관리(005 T095) */
const ME = "GET /api/v1/me";
const BLOG = "GET /api/v1/blogs/marco";
const LIST = "GET /api/v1/blogs/marco/manage/trackbacks";
const loggedIn = { cookie: "access_token=a" };
const me = {
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "marco", title: "marco 블로그" }],
  unseenReleaseNote: null,
};
const stub = (fn: unknown) => withCookie(fn as (args: { request: Request }) => unknown) as never;
const trackback = (id: number, overrides: Partial<ManagedTrackback> = {}): ManagedTrackback => ({
  id,
  title: `트랙백 ${id}`,
  excerpt: `요약 ${id}`,
  blogName: "다른 블로그",
  url: `https://other.example/${id}`,
  receivedAt: "2026-10-06T05:00:00Z",
  internal: false,
  hidden: false,
  post: { id: 123, title: "받은 글" },
  ...overrides,
});

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("받은 트랙백 loader·action", () => {
  it("loader: 블로그(트랙백 받기 상태)와 목록(0부터 쪽)", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [BLOG]: ok({ ...blog, trackbackEnabled: false }),
      [LIST]: ok([trackback(1)], { totalCount: 21 }),
    });

    const result = await loader(
      routeArgs<LoaderArgs>(getRequest("/marco/manage/trackbacks?page=2", loggedIn), {
        handle: "marco",
      }),
    );

    expect(result).toEqual({
      handle: "marco",
      page: 2,
      trackbackEnabled: false,
      trackbacks: [trackback(1)],
      totalCount: 21,
    });
    const query = backend.callsTo(LIST)[0].url.searchParams;
    expect([query.get("page"), query.get("size")]).toEqual(["1", "20"]);
  });

  it("loader: 남의 블로그는 404, backend 403도 404", async () => {
    mockBackend({ [ME]: ok(me) });
    expect(
      statusOf(
        await caught(
          loader(
            routeArgs<LoaderArgs>(getRequest("/other/manage/trackbacks", loggedIn), {
              handle: "other",
            }),
          ),
        ),
      ),
    ).toBe(404);

    mockBackend({ [ME]: ok(me), [BLOG]: ok(blog), [LIST]: fail(403, "FORBIDDEN") });
    expect(
      statusOf(
        await caught(
          loader(
            routeArgs<LoaderArgs>(getRequest("/marco/manage/trackbacks", loggedIn), {
              handle: "marco",
            }),
          ),
        ),
      ),
    ).toBe(404);
  });

  const post = (fields: Record<string, string>) =>
    action(
      routeArgs<ActionArgs>(formRequest("/marco/manage/trackbacks", fields, loggedIn), {
        handle: "marco",
      }),
    );

  it("action: 삭제는 DELETE /trackbacks/{id}, 잘못된 입력은 400, 오류 코드는 그대로", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      "DELETE /api/v1/trackbacks/5": ok(null),
      "DELETE /api/v1/trackbacks/6": fail(404, "TRACKBACK_NOT_FOUND"),
    });

    expect(asData(await post({ intent: "delete", id: "5" })).data).toEqual({
      intent: "delete",
      ok: true,
    });
    expect(backend.callsTo("DELETE /api/v1/trackbacks/5")).toHaveLength(1);
    expect(asData(await post({ intent: "delete", id: "6" })).data).toMatchObject({
      ok: false,
      resultCode: "TRACKBACK_NOT_FOUND",
    });
    expect(asData(await post({ intent: "hide", id: "5" })).init?.status).toBe(400);
    expect(asData(await post({ intent: "delete", id: "x" })).init?.status).toBe(400);
  });

  it("action: 로그인이 풀렸으면(401) 로그인 화면으로", async () => {
    mockBackend({ [ME]: ok(me), "DELETE /api/v1/trackbacks/5": fail(401, "UNAUTHORIZED") });
    expect(expectRedirect(await caught(post({ intent: "delete", id: "5" })))).toBe(
      "/login?next=%2Fmarco%2Fmanage%2Ftrackbacks",
    );
  });

  it("주소와 noindex", () => {
    expect(manageTrackbacksHref("marco")).toBe("/marco/manage/trackbacks");
    expect(manageTrackbacksHref("marco", 3)).toBe("/marco/manage/trackbacks?page=3");
    expect(meta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as never)).toContainEqual(
      { name: "robots", content: "noindex" },
    );
  });
});

describe("받은 트랙백 화면", () => {
  function renderPage(routes: Record<string, BackendHandler | Response>) {
    const backend = mockBackend({ [ME]: ok(me), [BLOG]: ok(blog), ...routes });
    renderRoutes(
      [
        {
          path: ":handle/manage",
          loader: stub(layoutLoader),
          Component: Layout,
          children: [
            {
              path: "trackbacks",
              loader: stub(loader),
              action: stub(action),
              Component: Trackbacks,
            },
          ],
        },
      ],
      { initialEntries: ["/marco/manage/trackbacks"] },
    );
    return backend;
  }

  it("메뉴의 받은 트랙백, 받기 상태와 설정 링크, 목록(받은 글·숨김 표시·삭제 불가)", async () => {
    renderPage({
      [LIST]: ok(
        [
          trackback(2),
          trackback(1, { hidden: true, url: "javascript:alert(1)", title: "<b>숨김</b>" }),
        ],
        { totalCount: 2 },
      ),
    });

    const list = await screen.findByRole("list", { name: "받은 트랙백 목록" });
    expect(
      within(screen.getByRole("navigation", { name: "블로그 관리 메뉴" })).getByRole("link", {
        name: "받은 트랙백",
      }),
    ).toHaveAttribute("href", "/marco/manage/trackbacks");
    expect(screen.getByText(/트랙백을 받고 있습니다/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "블로그 설정에서 바꾸기" })).toHaveAttribute(
      "href",
      "/marco/manage/settings",
    );

    const [first, second] = within(list).getAllByRole("listitem");
    expect(within(first).getByRole("link", { name: "트랙백 2" })).toHaveAttribute(
      "rel",
      "nofollow ugc noopener",
    );
    expect(within(first).getByRole("link", { name: "받은 글: 받은 글" })).toHaveAttribute(
      "href",
      "/marco/123#trackback-2",
    );
    expect(within(first).getByRole("button", { name: "트랙백 삭제: 트랙백 2" })).toBeEnabled();
    expect(second).toHaveTextContent("<b>숨김</b>");
    expect(within(second).queryByRole("link", { name: "<b>숨김</b>" })).toBeNull();
    expect(second).toHaveTextContent("숨김");
    expect(second).toHaveTextContent("관리자가 숨긴 트랙백은 삭제할 수 없습니다.");
    expect(within(second).queryByRole("button")).toBeNull();
  });

  it("트랙백 받기가 꺼져 있으면 안내, 빈 목록 안내", async () => {
    renderPage({
      [BLOG]: ok({ ...blog, trackbackEnabled: false }),
      [LIST]: ok([], { totalCount: 0 }),
    });
    expect(await screen.findByText(/트랙백 받기가 꺼져 있어/)).toBeInTheDocument();
    expect(screen.getByText("받은 트랙백이 없습니다.")).toBeInTheDocument();
  });

  it("삭제는 확인 후, 성공하면 안내", async () => {
    let items = [trackback(2)];
    const backend = renderPage({
      [LIST]: () => ok(items, { totalCount: items.length }),
      "DELETE /api/v1/trackbacks/2": () => {
        items = [];
        return ok(null);
      },
    });
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);

    const button = await screen.findByRole("button", { name: "트랙백 삭제: 트랙백 2" });
    fireEvent.click(button);
    expect(backend.callsTo("DELETE /api/v1/trackbacks/2")).toHaveLength(0);
    fireEvent.click(button);

    expect(await screen.findByRole("status")).toHaveTextContent("트랙백을 삭제했습니다.");
    expect(confirm).toHaveBeenCalledWith("이 트랙백을 삭제할까요?");
    expect(await screen.findByText("받은 트랙백이 없습니다.")).toBeInTheDocument();
  });
});
