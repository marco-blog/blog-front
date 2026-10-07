/**
 * 최신 글 "더 보기" 주소(003 research P6, contracts/routes.md `/`). 커서는 backend가 준 불투명한 문자열이다.
 * 출처 필터(007 `?source=`)가 있으면 같이 싣는다(전체는 붙이지 않음).
 */
import { type PortalSource, sourceQuery } from "~/external/sourceFilter";

function query(cursor: string, source: PortalSource): string {
  const params = new URLSearchParams();
  const value = sourceQuery(source);
  if (value) {
    params.set("source", value);
  }
  params.set("cursor", cursor);
  return params.toString();
}

/** JS 없이 이동하는 주소: 그 묶음을 SSR로 보여준다(검색 엔진에는 noindex). */
export function latestHref(cursor: string, source: PortalSource = "all"): string {
  return `/?${query(cursor, source)}`;
}

/** `useFetcher`로 메인 loader의 그 묶음만 받는 주소 */
export function latestFetchHref(cursor: string, source: PortalSource = "all"): string {
  return `/?index&${query(cursor, source)}`;
}
