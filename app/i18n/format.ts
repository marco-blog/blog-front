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
