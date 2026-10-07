/** 월별 보관함 연도 범위(backend `PostListFilter`와 같다) */
export const ARCHIVE_MIN_YEAR = 1970;
export const ARCHIVE_MAX_YEAR = 9999;

export interface YearMonth {
  year: number;
  month: number;
}

/** 보관함의 그 달 글 목록 주소(`/:handle/archive/2026/10`, 첫 쪽은 page 없음) */
export function archiveHref(handle: string, { year, month }: YearMonth, page = 1): string {
  const path = `/${handle}/archive/${year}/${month}`;
  return page > 1 ? `${path}?page=${page}` : path;
}

/** 주소의 연·월. 숫자가 아니거나 범위 밖이면 null(→ 404) */
export function parseYearMonth(
  year: string | undefined,
  month: string | undefined,
): YearMonth | null {
  if (!year || !month || !/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) {
    return null;
  }
  const value = { year: Number(year), month: Number(month) };
  if (value.year < ARCHIVE_MIN_YEAR || value.year > ARCHIVE_MAX_YEAR) {
    return null;
  }
  return value.month >= 1 && value.month <= 12 ? value : null;
}

/**
 * 화면 언어의 "연·월" 표기(ko "2026년 10월", en "October 2026", ja·zh-CN "2026年10月").
 * 보관함의 연·월은 서비스 기준 시간대 값이라 시간대 변환 없이 그대로 쓴다.
 */
export function formatYearMonth({ year, month }: YearMonth, language: string): string {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}
