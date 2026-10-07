import type { FormErrorData } from "~/api/formErrors";
import type { GuestbookEntry } from "~/api/models";

/** 방명록 화면 `action`의 작업(004 contracts/routes.md) */
export const GUESTBOOK_INTENTS = ["create", "reply", "update", "delete", "unlock"] as const;
export type GuestbookIntent = (typeof GUESTBOOK_INTENTS)[number];

/**
 * 방명록 작업 결과(직렬화 가능). 쓰기·고치기·지우기는 성공하면 같은 쪽으로 리다이렉트하므로 결과가 남지 않고,
 * 내용 보기(`unlock`, 비회원 비밀글을 고치기 전)만 성공 결과로 내용을 돌려준다.
 * `target`은 결과를 보여줄 폼(new, reply-{id}, edit-{id}, delete-{id}, unlock-{id}).
 */
export type GuestbookActionData =
  | { intent: "unlock"; target: string; ok: true; entry: GuestbookEntry }
  | (FormErrorData & { intent: string; target: string; ok: false });

/** 이 폼의 실패 결과만 */
export function errorFor(
  result: GuestbookActionData | undefined,
  target: string,
): (FormErrorData & { ok: false }) | null {
  return result && !result.ok && result.target === target ? result : null;
}
