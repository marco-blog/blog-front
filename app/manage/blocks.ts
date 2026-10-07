import type { FormErrorData } from "~/api/formErrors";
import type { CommentAuthor } from "~/api/models";

/** 블로그 회원 차단 작업(004 FR-146). 관리 댓글·방명록·차단 목록 화면이 같은 `action` 처리를 쓴다. */
export const BLOCK_INTENTS = ["block", "unblock"] as const;
export type BlockIntent = (typeof BLOCK_INTENTS)[number];

export type BlockActionData =
  | { intent: BlockIntent; ok: true; nickname: string | null }
  | (FormErrorData & { intent: BlockIntent; ok: false });

export function isBlockIntent(value: unknown): value is BlockIntent {
  return typeof value === "string" && (BLOCK_INTENTS as readonly string[]).includes(value);
}

/** 차단할 수 있는 작성자: 회원(비회원·탈퇴·알 수 없음은 아님)이고 블로그 주인 자신이 아님 */
export function blockableUserId(
  author: CommentAuthor | null | undefined,
  ownerId: number | null,
): number | null {
  if (!author || author.guest || author.userId === null || author.userId === ownerId) {
    return null;
  }
  return author.userId;
}
