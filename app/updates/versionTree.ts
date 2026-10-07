import type { ReleaseNoteSummary } from "~/api/models";

/** 릴리스 노트 버전(SemVer `major.minor.patch`, 각 자리 숫자 9자리까지) */
const VERSION_PATTERN = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;

export interface VersionGroup {
  /** `major.minor` */
  key: string;
  /** 새 버전부터 */
  items: ReleaseNoteSummary[];
}

function parts(version: string): number[] {
  const match = VERSION_PATTERN.exec(version);
  return match ? match.slice(1).map(Number) : [-1, -1, -1];
}

/** 숫자로 비교한다(1.10 > 1.9). 새 버전이 앞(내림차순) */
export function compareVersionsDesc(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) {
      return y[i] - x[i];
    }
  }
  return 0;
}

/** 버전 트리(003 FR-158): `major.minor`로 묶고, 묶음도 묶음 안도 새 버전이 위 */
export function groupVersions(items: readonly ReleaseNoteSummary[]): VersionGroup[] {
  const sorted = [...items].sort((a, b) => compareVersionsDesc(a.version, b.version));
  const groups: VersionGroup[] = [];
  for (const item of sorted) {
    const [major, minor] = parts(item.version);
    const key = `${major}.${minor}`;
    const last = groups.at(-1);
    if (last?.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, items: [item] });
    }
  }
  return groups;
}

/** 주소 조각 `v1.2.3` → `1.2.3`. 형식이 틀리면 null */
export function parseVersionParam(value: string | undefined): string | null {
  if (!value?.startsWith("v")) {
    return null;
  }
  const version = value.slice(1);
  return VERSION_PATTERN.test(version) ? version : null;
}

export const versionHref = (version: string) => `/updates/v${version}`;
export const historyHref = (version: string) => `${versionHref(version)}/history`;
export const revisionHref = (version: string, revisionNo: number) =>
  `${historyHref(version)}/${revisionNo}`;

/** 주소 조각의 수정본 번호(1 이상) */
export function parseRevisionNo(value: string | undefined): number | null {
  if (!value || !/^[1-9]\d{0,8}$/.test(value)) {
    return null;
  }
  return Number(value);
}

/** meta description용: HTML에서 글자만 꺼내 앞 `max`자 */
export function plainTextExcerpt(html: string, max = 150): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return [...text].slice(0, max).join("");
}

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 100;

/** 검색어 검사(003 FR-161, backend와 같은 2~100자). 문제없으면 null */
export function searchQueryError(
  q: string,
): { field: string; code: string; params: Record<string, number> } | null {
  const length = [...q.trim()].length;
  if (length < SEARCH_MIN) {
    return { field: "q", code: "TOO_SHORT", params: { min: SEARCH_MIN } };
  }
  if (length > SEARCH_MAX) {
    return { field: "q", code: "TOO_LONG", params: { max: SEARCH_MAX } };
  }
  return null;
}
