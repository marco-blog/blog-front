/**
 * 관리자 콘솔 좌측 메뉴(003 범위, 006 FR-102). 006이 대시보드·회원·신고 등 나머지 메뉴를 더한다.
 * `key`는 문구 `admin:nav.{key}`.
 */
export const ADMIN_MENU = [
  { key: "topics", path: "/admin/topics" },
  { key: "curations", path: "/admin/portal/curations" },
  { key: "exclusions", path: "/admin/portal/exclusions" },
  { key: "settings", path: "/admin/portal/settings" },
] as const;

/** `/admin`으로 들어오면 여는 첫 화면(대시보드는 006 FR-103) */
export const ADMIN_HOME = ADMIN_MENU[0].path;
