import { useRouteLoaderData } from "react-router";

import { DEFAULT_TIME_ZONE } from "./format";
import type { RootLoaderData } from "./root-data";

/**
 * `datetime-local` 입력(회원 시간대의 벽시계 시각)과 UTC ISO 시각을 오간다. 003 관리자 콘솔의 기간(T102)과
 * 004 예약 발행 시각(FR-064, contracts/routes.md "회원 시간대로 입력하고 UTC로 보냄")이 함께 쓴다.
 * 시간대는 세션 회원의 `timeZone`이고, 모르는 시간대면 UTC로 본다. 서머타임 경계에서 두 번 있는 벽시계 시각(가을)은
 * 앞의 것으로, 없는 시각(봄)은 바뀌기 전 오프셋으로 계산한 실제 시각으로 본다.
 */
const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function parts(epochMs: number, timeZone: string): number[] {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => Number(formatted.find((part) => part.type === type)?.value ?? 0);
  return [get("year"), get("month"), get("day"), get("hour"), get("minute"), get("second")];
}

function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** 그 시각에 시간대가 UTC보다 앞선 밀리초 */
function offsetMs(epochMs: number, timeZone: string): number {
  const [y, mo, d, h, mi, s] = parts(epochMs, timeZone);
  return Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(epochMs / 1000) * 1000;
}

/** `2026-10-06T09:00`(시간대 벽시계) → `2026-10-06T00:00:00Z`. 형식이 틀리면 null */
export function localToUtcIso(local: string | null | undefined, timeZone: string): string | null {
  const match = LOCAL_PATTERN.exec((local ?? "").trim());
  if (!match) {
    return null;
  }
  const [y, mo, d, h, mi, s] = match.slice(1).map((value) => Number(value ?? 0));
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(wall) || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) {
    return null;
  }
  const zone = safeZone(timeZone);
  // 벽시계 시각에서 오프셋을 빼고, 서머타임 경계를 위해 한 번 더 맞춘다.
  let utc = wall - offsetMs(wall, zone);
  utc = wall - offsetMs(utc, zone);
  return new Date(utc).toISOString().replace(/\.000Z$/, "Z");
}

/** UTC ISO 시각 → 시간대 벽시계 `YYYY-MM-DDTHH:mm`(`datetime-local` 값). 잘못된 값이면 "" */
export function utcIsoToLocal(iso: string | null | undefined, timeZone: string): string {
  const epoch = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(epoch)) {
    return "";
  }
  const [y, mo, d, h, mi] = parts(epoch, safeZone(timeZone));
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

/** 화면이 쓸 회원 시간대(비회원·모름은 Asia/Seoul, research.md R22) */
export function useTimeZone(): string {
  const root = useRouteLoaderData("root") as (RootLoaderData & { timeZone?: string }) | undefined;
  return root?.timeZone ?? DEFAULT_TIME_ZONE;
}
