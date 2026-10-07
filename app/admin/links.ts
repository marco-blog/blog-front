/**
 * 관리자 콘솔 좌측 메뉴(006 FR-102, contracts/routes.md "콘솔 메뉴"). 순서는 FR-102 표 순서이고 `group`은 표시용 묶음
 * (`admin:nav.groups.{group}`), `spec`은 화면을 만드는 스펙이다. `available`이 false인 항목은 메뉴에 없고 경로도 `routes.ts`에
 * 없다(그 스펙이 켠다). `key`는 문구 `admin:nav.{key}`.
 */
export type AdminMenuGroup = "operations" | "portal" | "service";

export interface AdminMenuItem {
  key: string;
  path: string;
  group: AdminMenuGroup;
  spec: "003" | "005" | "006" | "007";
  available: boolean;
}

export const ADMIN_MENU: readonly AdminMenuItem[] = [
  { key: "dashboard", path: "/admin", group: "operations", spec: "006", available: true },
  { key: "topics", path: "/admin/topics", group: "portal", spec: "003", available: true },
  {
    key: "curations",
    path: "/admin/portal/curations",
    group: "portal",
    spec: "003",
    available: true,
  },
  {
    key: "exclusions",
    path: "/admin/portal/exclusions",
    group: "portal",
    spec: "003",
    available: true,
  },
  {
    key: "settings",
    path: "/admin/portal/settings",
    group: "portal",
    spec: "003",
    available: true,
  },
  { key: "users", path: "/admin/users", group: "operations", spec: "005", available: true },
  {
    key: "contents",
    path: "/admin/contents/posts",
    group: "operations",
    spec: "006",
    available: true,
  },
  // 005 숨긴 글 화면. 006 T039(005 머지 후)가 `/admin/contents/posts?status=HIDDEN`으로 흡수한다.
  {
    key: "hiddenPosts",
    path: "/admin/contents/hidden-posts",
    group: "operations",
    spec: "005",
    available: true,
  },
  { key: "reports", path: "/admin/reports", group: "operations", spec: "005", available: true },
  {
    key: "externalBlogs",
    path: "/admin/external-blogs",
    group: "portal",
    spec: "007",
    available: false,
  },
  { key: "spam", path: "/admin/spam", group: "operations", spec: "005", available: true },
  {
    key: "reservedHandles",
    path: "/admin/reserved-handles",
    group: "service",
    spec: "006",
    available: true,
  },
  {
    key: "serviceSettings",
    path: "/admin/settings",
    group: "service",
    spec: "006",
    available: true,
  },
  { key: "admins", path: "/admin/admins", group: "service", spec: "006", available: true },
  { key: "auditLog", path: "/admin/audit-log", group: "service", spec: "006", available: true },
  {
    key: "releaseNotes",
    path: "/admin/release-notes",
    group: "service",
    spec: "006",
    available: true,
  },
];

/** 처리 대기 신고 수 배지를 붙이는 메뉴(005, `GET /admin/reports/summary`) */
export const ADMIN_REPORTS_MENU_KEY = "reports";

/** 콘솔 첫 화면(대시보드, 006 FR-103) */
export const ADMIN_HOME = "/admin";

/** 다른 스펙에 기대는 콘솔 기능 스위치. `contentHide`는 005 숨김 API를 콘텐츠 관리 표에 연결한다(006 T039가 켬). */
export const ADMIN_FEATURES = { contentHide: false };

/** 메뉴에 보이는 항목을 묶음이 바뀔 때마다 나눈다(순서는 그대로). */
export function adminMenuSections(
  items: readonly AdminMenuItem[] = ADMIN_MENU,
): { group: AdminMenuGroup; items: AdminMenuItem[] }[] {
  const sections: { group: AdminMenuGroup; items: AdminMenuItem[] }[] = [];
  for (const item of items.filter((entry) => entry.available)) {
    const last = sections.at(-1);
    if (last && last.group === item.group) {
      last.items.push(item);
    } else {
      sections.push({ group: item.group, items: [item] });
    }
  }
  return sections;
}
