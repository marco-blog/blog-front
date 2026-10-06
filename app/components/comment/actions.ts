import type { FormErrorData } from "~/api/formErrors";

/** 글 상세 `action`의 댓글 작업 */
export type CommentIntent = "create" | "edit" | "delete";

/** 댓글 작업 결과(직렬화 가능). `target`은 결과를 보여줄 폼(new, reply-{id}, edit-{id}, delete-{id}) */
export type CommentActionData =
  | { intent: CommentIntent; target: string; ok: true }
  | (FormErrorData & { intent: CommentIntent; target: string; ok: false });
