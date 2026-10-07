import type { AdminTopicNode } from "~/api/models";

import { rootData } from "./render";
import { withCookie } from "./route";

/** 관리자 콘솔 시험의 공통 값(003 T089~T092) */
export const ME = "GET /api/v1/me";
export const loggedIn = { cookie: "access_token=a" };

export const member = (role = "ADMIN", timeZone = "Asia/Seoul") => ({
  userId: 1,
  email: "admin@example.com",
  nickname: "운영자",
  bio: null,
  profileImageUrl: null,
  role,
  locale: "ko",
  timeZone,
  blogs: [],
  unseenReleaseNote: null,
  unreadNotificationCount: 0,
});

/** 라우트 스텁에서 loader·action에 로그인 쿠키를 싣는다. */
export const stub = (fn: unknown) =>
  withCookie(fn as (args: { request: Request }) => unknown) as never;

export const metaArgs = (loaderData = {}) =>
  ({ matches: [{ id: "root", loaderData: rootData("ko") }], loaderData }) as never;

export function adminTopic(
  id: number,
  slug: string,
  overrides: Partial<AdminTopicNode> = {},
  children: AdminTopicNode[] = [],
): AdminTopicNode {
  return {
    id,
    slug,
    parentId: null,
    names: { ko: `${slug} 한`, en: `${slug} en`, ja: `${slug} ja`, "zh-CN": `${slug} zh` },
    cardColor: null,
    onTab: true,
    adminHidden: false,
    effectiveHidden: false,
    pinnedOnTab: false,
    recentPostCount: 0,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    children,
    ...overrides,
  };
}
