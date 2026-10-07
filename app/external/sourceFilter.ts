/**
 * 포털 출처 필터(007 FR-120, contracts/routes.md `/`·`/topics/**`): 전체·내부 글만·외부 글만. 주소에는 `?source=`로 싣고
 * 기본값(전체)은 붙이지 않는다. backend `source` 파라미터와 값이 같다.
 */
export const PORTAL_SOURCES = ["all", "internal", "external"] as const;

export type PortalSource = (typeof PORTAL_SOURCES)[number];

/** 주소의 `?source=`. 모르는 값은 전체 */
export function parseSource(value: string | null | undefined): PortalSource {
  return (PORTAL_SOURCES as readonly string[]).includes(value ?? "")
    ? (value as PortalSource)
    : "all";
}

/** backend에 넘길 값. 전체면 보내지 않는다 */
export function sourceQuery(source: PortalSource): PortalSource | undefined {
  return source === "all" ? undefined : source;
}

/**
 * `path`에 출처를 붙인 주소. 출처를 바꾸면 커서·페이지는 버린다(`extra`로 넘긴 값만 남김, 예: 주제 정렬).
 */
export function sourceHref(
  path: string,
  source: PortalSource,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (value) {
      params.set(key, value);
    }
  }
  if (source !== "all") {
    params.set("source", source);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
