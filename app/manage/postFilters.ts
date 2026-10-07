import type { PostStatus, Visibility } from "~/api/models";

/**
 * 글 관리 조건의 값(006 FR-099 "001 data-model의 status·visibility 값" 중 머지된 스펙 몫). 블로그 관리 글 목록과 콘솔 콘텐츠 관리가
 * 함께 쓴다. 004가 `SCHEDULED`·`PROTECTED`를, 005가 관리자가 숨긴 글 `HIDDEN`을 더했다. 문구는 `manage:status.*`·
 * `manage:visibility.*`.
 */
export const POST_STATUS_FILTERS: readonly PostStatus[] = [
  "DRAFT",
  "PUBLISHED",
  "SCHEDULED",
  "DELETED",
  "HIDDEN",
];

export const POST_VISIBILITY_FILTERS: readonly Visibility[] = ["PUBLIC", "PRIVATE", "PROTECTED"];

/** `value`가 `values` 중 하나면 그 값, 아니면 null(주소의 모르는 값은 버린다) */
export function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;
}
