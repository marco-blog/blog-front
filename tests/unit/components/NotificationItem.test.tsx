// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Notification } from "~/api/models";
import { NotificationItem } from "~/components/notification/NotificationItem";
import { isKnownNotificationType, notificationHref } from "~/components/notification/links";

import { renderRoutes } from "../support/render";

/** 백업 준비 알림(T105, 004 FR-145): 문구와 링크 */
const backupReady: Notification = {
  id: 9,
  type: "BACKUP_READY",
  actor: null,
  blog: { handle: "marco", title: "마르코의 블로그" },
  targetType: "BLOG_EXPORT",
  targetId: 3,
  params: { blogTitle: "마르코의 블로그", handle: "marco", expiresAt: "2026-10-14T00:01:00Z" },
  read: false,
  createdAt: "2026-10-07T00:01:00Z",
};

function renderItem(notification: Notification, language: "ko" | "en" = "ko") {
  renderRoutes(
    [{ path: "notifications", Component: () => <NotificationItem notification={notification} /> }],
    { initialEntries: ["/notifications"], language, timeZone: "Asia/Seoul" },
  );
}

describe("BACKUP_READY 알림", () => {
  it("아는 종류이고, 블로그 제목과 내려받을 수 있는 마지막 시각을 넣는다", async () => {
    expect(isKnownNotificationType("BACKUP_READY")).toBe(true);
    renderItem(backupReady);
    expect(
      await screen.findByText(
        /마르코의 블로그 백업이 준비되었습니다\. 2026년 10월 14일 오전 9:01까지 내려받을 수 있습니다\./,
      ),
    ).toBeInTheDocument();
  });

  it("화면 언어로", async () => {
    renderItem(backupReady, "en");
    expect(
      await screen.findByText(
        /The backup of 마르코의 블로그 is ready\. You can download it until Oct 14, 2026/,
      ),
    ).toBeInTheDocument();
  });

  it("링크는 그 블로그의 백업 화면, 블로그가 없으면 params의 handle, 둘 다 없으면 알림 목록", () => {
    expect(notificationHref(backupReady)).toBe("/marco/manage/backup");
    expect(notificationHref({ ...backupReady, blog: null })).toBe("/marco/manage/backup");
    expect(notificationHref({ ...backupReady, blog: null, params: {} })).toBe("/notifications");
    expect(notificationHref({ ...backupReady, blog: null, params: { handle: "../evil" } })).toBe(
      "/notifications",
    );
  });
});
