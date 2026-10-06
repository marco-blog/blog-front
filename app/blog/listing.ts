import { normalizeTag, TAG_MAX_LENGTH } from "~/components/post/TagInput";

/** 한 페이지 글 수(FR-011) */
export const POST_PAGE_SIZE = 20;
const MAX_PAGE = 100_000;

/** 주소의 `?page=`(1부터). 잘못된 값은 첫 페이지 */
export function parsePage(value: string | null): number {
  if (!value || !/^\d{1,6}$/.test(value)) {
    return 1;
  }
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

/** 주소에 페이지 번호를 붙인다(첫 페이지는 붙이지 않음). */
export function withPage(path: string, page: number): string {
  return page <= 1 ? path : `${path}?page=${page}`;
}

/** 주소의 태그 이름을 backend와 같은 규칙으로 정규화한다. 태그가 될 수 없는 값이면 null */
export function parseTagName(value: string | undefined): string | null {
  const tag = normalizeTag(value ?? "");
  return tag && tag.length <= TAG_MAX_LENGTH ? tag : null;
}
