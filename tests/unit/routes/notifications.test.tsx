// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Notification } from "~/api/models";
import { notificationHref } from "~/components/notification/links";
import NotificationsPage, { action, loader, meta } from "~/routes/notifications";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
} from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const ME = "GET /api/v1/me";
const LIST = "GET /api/v1/me/notifications";
const BULK = "POST /api/v1/me/notifications/bulk";
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
  unreadNotificationCount: 2,
};
const loggedIn = { cookie: "access_token=a" };

const comment: Notification = {
  id: 501,
  type: "NEW_COMMENT",
  actor: { userId: 7, nickname: "독자", profileImageUrl: null, withdrawn: false },
  blog: { handle: "marco", title: "마르코의 블로그" },
  targetType: "COMMENT",
  targetId: 3001,
  params: { postId: 123, postTitle: "첫 글" },
  read: false,
  createdAt: "2026-10-06T04:24:19Z",
};
const subscriber: Notification = {
  id: 502,
  type: "NEW_SUBSCRIBER",
  actor: { userId: 8, nickname: null, profileImageUrl: null, withdrawn: true },
  blog: { handle: "marco", title: "마르코의 블로그" },
  targetType: "BLOG",
  targetId: 10,
  params: { blogTitle: "마르코의 블로그" },
  read: true,
  createdAt: "2026-10-05T04:24:19Z",
};
const unknown: Notification = {
  id: 503,
  type: "REPORT_RESOLVED",
  actor: null,
  blog: null,
  targetType: "REPORT",
  targetId: 9,
  params: { result: "ACTIONED" },
  read: true,
  createdAt: "2026-10-04T04:24:19Z",
};

/** 알림 화면(T048, 002 FR-033) */
describe("notifications loader", () => {
  it("비로그인은 로그인 화면으로", async () => {
    mockBackend({ [ME]: fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(loader(routeArgs<LoaderArgs>(getRequest("/notifications", { cookie: "x=1" })))),
    );

    expect(location).toBe("/login?next=%2Fnotifications");
  });

  it("/me/notifications?page=(0부터)", async () => {
    const backend = mockBackend({ [ME]: ok(me), [LIST]: ok([comment], { totalCount: 21 }) });

    const result = await loader(
      routeArgs<LoaderArgs>(getRequest("/notifications?page=2", loggedIn)),
    );

    expect(result).toEqual({ notifications: [comment], totalCount: 21, page: 2, pageSize: 20 });
    expect(backend.callsTo(LIST)[0].url.searchParams.get("page")).toBe("1");
  });

  it("meta는 noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("ko") }] } as never;
    expect(meta(args)).toEqual([
      { title: "알림 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("notifications action", () => {
  const callAction = (fields: Record<string, string>, headers = loggedIn) =>
    action(routeArgs<ActionArgs>(formRequest("/notifications", fields, headers)));

  it("intent=read: 읽음 처리 뒤 댓글 위치로(/{handle}/{postId}#comment-{id})", async () => {
    const backend = mockBackend({
      "POST /api/v1/me/notifications/501/read": ok({ ...comment, read: true }),
    });

    const location = expectRedirect(await callAction({ intent: "read", id: "501" }));

    expect(location).toBe("/marco/123#comment-3001");
    expect(backend.callsTo("POST /api/v1/me/notifications/501/read")).toHaveLength(1);
  });

  it("NEW_SUBSCRIBER는 /{handle}로", async () => {
    mockBackend({ "POST /api/v1/me/notifications/502/read": ok(subscriber) });

    expect(expectRedirect(await callAction({ intent: "read", id: "502" }))).toBe("/marco");
  });

  it("intent=read-all은 bulk(MARK_READ) 뒤 알림 화면으로", async () => {
    const backend = mockBackend({ [BULK]: ok({ updated: 2 }) });

    expect(expectRedirect(await callAction({ intent: "read-all" }))).toBe("/notifications");
    expect(backend.callsTo(BULK)[0].body).toEqual({ action: "MARK_READ" });
  });

  it("남의·없는 알림(NOTIFICATION_NOT_FOUND)은 404와 오류 코드", async () => {
    mockBackend({
      "POST /api/v1/me/notifications/9/read": fail(404, "NOTIFICATION_NOT_FOUND"),
    });

    const result = asData(await callAction({ intent: "read", id: "9" }));

    expect(result.init?.status).toBe(404);
    expect(result.data).toEqual({ ok: false, resultCode: "NOTIFICATION_NOT_FOUND" });
  });

  it("잘못된 요청(모르는 작업, 숫자가 아닌 id)은 backend를 부르지 않고 400", async () => {
    const backend = mockBackend();

    expect(statusOf(await callAction({ intent: "hack" }))).toBe(400);
    expect(statusOf(await callAction({ intent: "read", id: "abc" }))).toBe(400);
    expect(backend.calls).toHaveLength(0);
  });

  it("로그인이 풀렸으면(401) 알림 화면으로 돌아오는 로그인 화면으로", async () => {
    mockBackend({ [BULK]: fail(401, "UNAUTHENTICATED") });

    expect(expectRedirect(await caught(callAction({ intent: "read-all" }, { cookie: "" })))).toBe(
      "/login?next=%2Fnotifications",
    );
  });
});

describe("notificationHref", () => {
  it("값이 빠졌거나 모르는 종류면 알림 목록", () => {
    expect(notificationHref(unknown)).toBe("/notifications");
    expect(notificationHref({ ...comment, params: {} })).toBe("/notifications");
    expect(notificationHref({ ...comment, targetId: null })).toBe("/marco/123");
    expect(notificationHref({ ...comment, params: { postId: "77" } })).toBe(
      "/marco/77#comment-3001",
    );
    expect(notificationHref({ ...comment, blog: { handle: "//evil", title: "x" } })).toBe(
      "/notifications",
    );
    expect(notificationHref({ ...subscriber, type: "SOMETHING_NEW" })).toBe("/notifications");
  });
});

describe("notifications 화면", () => {
  function renderPage(data: LoaderData, language: "ko" | "en" = "ko") {
    const submitted: FormData[] = [];
    renderRoutes(
      [
        {
          path: "notifications",
          loader: () => data,
          Component: NotificationsPage,
          action: async ({ request }) => {
            submitted.push(await request.formData());
            return null;
          },
        },
      ],
      { initialEntries: ["/notifications"], language },
    );
    return submitted;
  }

  it("종류별 문구(일으킨 회원·글 제목), 탈퇴 회원, 모르는 종류, 안 읽은 표시, 날짜", async () => {
    renderPage({
      notifications: [comment, subscriber, unknown],
      totalCount: 3,
      page: 1,
      pageSize: 20,
    });

    const list = await screen.findByRole("list", { name: "알림 목록" });
    const items = within(list).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("안 읽음 독자님이 「첫 글」에 댓글을 남겼습니다.");
    expect(items[0]).toHaveClass("notification-unread");
    expect(within(items[0]).getByText("2026년 10월 6일 오후 1:24")).toHaveAttribute(
      "dateTime",
      "2026-10-06T04:24:19Z",
    );
    expect(items[1]).toHaveTextContent("탈퇴한 회원님이 마르코의 블로그 블로그를 구독했습니다.");
    expect(items[1]).not.toHaveTextContent("안 읽음");
    expect(items[2]).toHaveTextContent("새 알림이 있습니다.");
  });

  it("영어 화면 문구", async () => {
    renderPage({ notifications: [comment], totalCount: 1, page: 1, pageSize: 20 }, "en");

    expect(
      await screen.findByRole("button", { name: /독자 commented on "첫 글"\./ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark all as read" })).toBeInTheDocument();
  });

  it("알림을 누르면 intent=read와 id를 보낸다, 모두 읽음은 intent=read-all", async () => {
    const submitted = renderPage({
      notifications: [comment],
      totalCount: 1,
      page: 1,
      pageSize: 20,
    });

    fireEvent.click(await screen.findByRole("button", { name: /독자님이/ }));
    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(Object.fromEntries(submitted[0])).toEqual({ intent: "read", id: "501" });

    fireEvent.click(screen.getByRole("button", { name: "모두 읽음으로 표시" }));
    await waitFor(() => expect(submitted).toHaveLength(2));
    expect(Object.fromEntries(submitted[1])).toEqual({ intent: "read-all" });
  });

  it("알림이 없으면 안내(모두 읽음 버튼 없음)", async () => {
    renderPage({ notifications: [], totalCount: 0, page: 1, pageSize: 20 });

    expect(await screen.findByText("새 알림이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "모두 읽음으로 표시" })).toBeNull();
  });
});
