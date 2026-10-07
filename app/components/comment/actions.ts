import type { FormErrorData } from "~/api/formErrors";
import type { Comment } from "~/api/models";

/** 글 상세 `action`의 댓글 작업. `unlockComment`는 비회원 비밀 댓글을 고치기 전에 비밀번호로 내용을 받는다(004). */
export type CommentIntent = "create" | "edit" | "delete" | "unlockComment";

/**
 * 댓글 작업 결과(직렬화 가능). `target`은 결과를 보여줄 폼(new, reply-{id}, edit-{id}, delete-{id}, unlock-{id}).
 * 내용 받기(`unlockComment`)의 성공 결과에는 내용이 든 댓글이 온다.
 */
export type CommentActionData =
  | { intent: "unlockComment"; target: string; ok: true; comment: Comment }
  | { intent: Exclude<CommentIntent, "unlockComment">; target: string; ok: true }
  | (FormErrorData & { intent: CommentIntent; target: string; ok: false });

/** 이 폼의 실패 결과만 */
export function commentErrorFor(
  result: CommentActionData | undefined,
  target: string,
): (FormErrorData & { ok: false }) | null {
  return result && !result.ok && result.target === target ? result : null;
}
