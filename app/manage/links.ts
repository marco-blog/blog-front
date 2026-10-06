import type { PostSummary } from "~/api/models";

/** 관리 화면에서 글 제목을 누르면 가는 주소: 발행된 글은 글 상세, 발행 전 글은 작성 화면 */
export function postHref(handle: string, post: Pick<PostSummary, "id" | "status">): string {
  return post.status === "PUBLISHED" ? `/${handle}/${post.id}` : `/${handle}/write/${post.id}`;
}
