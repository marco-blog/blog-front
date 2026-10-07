/**
 * 관리자 콘솔 좌측 메뉴(003 범위 + 005 회원·신고·숨긴 글, 006 FR-102). 006이 대시보드 등 나머지 메뉴를 더한다.
 * `key`는 문구 `admin:nav.{key}`. 첫 항목이 `/admin`의 첫 화면이다.
 */
export const ADMIN_MENU = [
  { key: "topics", path: "/admin/topics" },
  { key: "curations", path: "/admin/portal/curations" },
  { key: "exclusions", path: "/admin/portal/exclusions" },
  { key: "settings", path: "/admin/portal/settings" },
  { key: "users", path: "/admin/users" },
  { key: "reports", path: "/admin/reports" },
  { key: "hiddenPosts", path: "/admin/contents/hidden-posts" },
] as const;

/** 처리 대기 신고 수 배지를 붙이는 메뉴(005, `GET /admin/reports/summary`) */
export const ADMIN_REPORTS_MENU_KEY = "reports";

/** `/admin`으로 들어오면 여는 첫 화면(대시보드는 006 FR-103) */
export const ADMIN_HOME = ADMIN_MENU[0].path;
