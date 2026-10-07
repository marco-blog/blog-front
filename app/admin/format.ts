import type { TFunction } from "i18next";

/** 바이트 단위(1024배씩). 화면 언어와 관계없이 같은 기호를 쓴다. */
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * 바이트 수를 사람이 읽는 크기로(006 서비스 설정, T038): 10485760 → "10 MB", 1536 → "1.5 KB".
 * 소수는 한 자리까지, 숫자 모양은 화면 언어(`Intl.NumberFormat`).
 */
export function formatBytes(bytes: number, language: string): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return String(bytes);
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  return `${number} ${BYTE_UNITS[unit]}`;
}

const DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** ISO-8601 기간(`PT8760H`, `P1D`, `PT5M`, `PT0S`)을 초로. 읽지 못하면 null */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const match = DURATION_PATTERN.exec(iso.trim().toUpperCase());
  if (!match || iso.trim().toUpperCase() === "P" || iso.trim().toUpperCase() === "PT") {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/** 기간을 나누어떨어지는 가장 큰 단위 하나로: 기간 키(`admin:format.{unit}`)와 수 */
export function durationParts(totalSeconds: number): {
  unit: "days" | "hours" | "minutes" | "seconds";
  count: number;
} {
  if (totalSeconds > 0 && totalSeconds % 86400 === 0) {
    return { unit: "days", count: totalSeconds / 86400 };
  }
  if (totalSeconds > 0 && totalSeconds % 3600 === 0) {
    return { unit: "hours", count: totalSeconds / 3600 };
  }
  if (totalSeconds > 0 && totalSeconds % 60 === 0) {
    return { unit: "minutes", count: totalSeconds / 60 };
  }
  return { unit: "seconds", count: totalSeconds };
}

/** ISO 기간을 화면 언어로("365일", "5 minutes"). 읽지 못하면 원래 값 */
export function formatDuration(t: TFunction, iso: string): string {
  const seconds = parseIsoDuration(iso);
  if (seconds === null) {
    return iso;
  }
  const { unit, count } = durationParts(seconds);
  return t(`admin:format.${unit}`, { count });
}
