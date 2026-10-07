import { useTranslation } from "react-i18next";
import { useRouteLoaderData } from "react-router";

import type { RootLoaderData } from "./root-data";

/** 시간대를 모를 때(비회원)의 기준(research.md R22, FR-153) */
export const DEFAULT_TIME_ZONE = "Asia/Seoul";

function format(
  iso: string | null | undefined,
  language: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  try {
    return new Intl.DateTimeFormat(language, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(language, { ...options, timeZone: DEFAULT_TIME_ZONE }).format(
      date,
    );
  }
}

/** 날짜 표기(FR-153): ko "2026년 10월 6일", en "Oct 6, 2026", ja·zh-CN "2026年10月6日" */
const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

/** 날짜. 서버와 브라우저가 같은 언어·시간대로 그려 hydration 결과가 같다. */
export function formatDate(iso: string | null | undefined, language: string, timeZone: string) {
  return format(iso, language, timeZone, DATE_OPTIONS);
}

/** 날짜와 시각(예: ko "2026년 10월 6일 오후 1:24", en "Oct 6, 2026, 1:24 PM") */
export function formatDateTime(iso: string | null | undefined, language: string, timeZone: string) {
  return format(iso, language, timeZone, { ...DATE_OPTIONS, hour: "numeric", minute: "2-digit" });
}

/** 숫자(조회수·글 수 등)를 화면 언어의 표기로(예: 1,234). 번역 문구 안의 숫자는 `{{views, number}}`로 같은 표기를 쓴다. */
export function formatNumber(value: number | null | undefined, language: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "";
  }
  return new Intl.NumberFormat(language).format(value);
}

/** 화면 언어와 회원 시간대(비회원은 Asia/Seoul)로 날짜·숫자를 쓰는 함수들 */
export function useDateFormat() {
  const { i18n } = useTranslation();
  const root = useRouteLoaderData("root") as (RootLoaderData & { timeZone?: string }) | undefined;
  const timeZone = root?.timeZone ?? DEFAULT_TIME_ZONE;
  return {
    date: (iso: string | null | undefined) => formatDate(iso, i18n.language, timeZone),
    dateTime: (iso: string | null | undefined) => formatDateTime(iso, i18n.language, timeZone),
    number: (value: number | null | undefined) => formatNumber(value, i18n.language),
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** 이보다 오래되면 상대 시각 대신 날짜(003 결정 표 23번) */
const RELATIVE_LIMIT = 7 * DAY;

/**
 * 상대 시각(003 FR-085, research P7): "방금"(1분 미만)·"N분 전"·"N시간 전"·"N일 전", 7일을 넘으면 날짜.
 * 기준 시각 `now`는 loader가 넘긴 서버 시각이라 SSR과 hydration 결과가 같다. 미래 시각은 "방금"으로 본다.
 */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: string | Date,
  language: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (!iso) {
    return "";
  }
  const time = new Date(iso).getTime();
  const base = (now instanceof Date ? now : new Date(now)).getTime();
  if (Number.isNaN(time) || Number.isNaN(base)) {
    return "";
  }
  const elapsed = Math.max(0, base - time);
  if (elapsed > RELATIVE_LIMIT) {
    return formatDate(iso, language, timeZone);
  }
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (elapsed < MINUTE) {
    return rtf.format(0, "second");
  }
  if (elapsed < HOUR) {
    return rtf.format(-Math.floor(elapsed / MINUTE), "minute");
  }
  if (elapsed < DAY) {
    return rtf.format(-Math.floor(elapsed / HOUR), "hour");
  }
  return new Intl.RelativeTimeFormat(language, { numeric: "always" }).format(
    -Math.floor(elapsed / DAY),
    "day",
  );
}

/** 화면 언어·회원 시간대로 `now`(서버 시각) 기준 상대 시각을 쓴다. */
export function useRelativeTime(now: string | Date) {
  const { i18n } = useTranslation();
  const root = useRouteLoaderData("root") as (RootLoaderData & { timeZone?: string }) | undefined;
  const timeZone = root?.timeZone ?? DEFAULT_TIME_ZONE;
  return (iso: string | null | undefined) => formatRelativeTime(iso, now, i18n.language, timeZone);
}
