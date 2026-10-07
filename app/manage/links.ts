import type { PostSummary } from "~/api/models";

/** 관리 화면에서 글 제목을 누르면 가는 주소: 발행된 글은 글 상세, 발행 전 글은 작성 화면 */
export function postHref(handle: string, post: Pick<PostSummary, "id" | "status">): string {
  return post.status === "PUBLISHED" ? `/${handle}/${post.id}` : `/${handle}/write/${post.id}`;
}

/**
 * 블로그 관리 메뉴(006 FR-099 표 순서, contracts/routes.md "블로그 관리 메뉴"). `path`는 `/:handle/manage` 뒤의 경로이고
 * `available`이 false인 항목은 메뉴에 없고 경로도 `routes.ts`에 없다(그 스펙이 켠다). 문구는 `manage:nav.{key}`.
 */
export const MANAGE_MENU = [
  { key: "dashboard", path: "", available: true },
  { key: "posts", path: "/posts", available: true },
  { key: "categories", path: "/categories", available: true },
  { key: "comments", path: "/comments", available: true },
  { key: "guestbook", path: "/guestbook", available: true },
  { key: "settings", path: "/settings", available: true },
  { key: "design", path: "/design", available: true },
  { key: "feed", path: "/feed", available: true },
  { key: "stats", path: "/stats", available: true },
  { key: "trackbacks", path: "/trackbacks", available: true },
  { key: "backup", path: "/backup", available: true },
  { key: "blocks", path: "/blocks", available: true },
  { key: "externalBlogs", path: "/external-blogs", available: false },
] as const;
