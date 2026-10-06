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

/** 날짜(예: 2026. 10. 6.). 서버와 브라우저가 같은 언어·시간대로 그려 hydration 결과가 같다. */
export function formatDate(iso: string | null | undefined, language: string, timeZone: string) {
  return format(iso, language, timeZone, { dateStyle: "medium" });
}

/** 날짜와 시각(예: 2026. 10. 6. 오후 1:24) */
export function formatDateTime(iso: string | null | undefined, language: string, timeZone: string) {
  return format(iso, language, timeZone, { dateStyle: "medium", timeStyle: "short" });
}

/** 화면 언어와 회원 시간대(비회원은 Asia/Seoul)로 날짜를 쓰는 함수들 */
export function useDateFormat() {
  const { i18n } = useTranslation();
  const root = useRouteLoaderData("root") as (RootLoaderData & { timeZone?: string }) | undefined;
  const timeZone = root?.timeZone ?? DEFAULT_TIME_ZONE;
  return {
    date: (iso: string | null | undefined) => formatDate(iso, i18n.language, timeZone),
    dateTime: (iso: string | null | undefined) => formatDateTime(iso, i18n.language, timeZone),
  };
}
