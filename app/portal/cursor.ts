/** 최신 글 "더 보기" 주소(003 research P6, contracts/routes.md `/`). 커서는 backend가 준 불투명한 문자열이다. */

/** JS 없이 이동하는 주소: 그 묶음을 SSR로 보여준다(검색 엔진에는 noindex). */
export function latestHref(cursor: string): string {
  return `/?${new URLSearchParams({ cursor }).toString()}`;
}

/** `useFetcher`로 메인 loader의 그 묶음만 받는 주소 */
export function latestFetchHref(cursor: string): string {
  return `/?index&${new URLSearchParams({ cursor }).toString()}`;
}
