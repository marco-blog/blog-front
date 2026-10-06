/**
 * 포털 설정 "신규 회원 대기 시간"(003 `portal.new-member-delay`)의 ISO-8601 기간과 화면의 시간 단위 입력을 오간다.
 * backend(`java.time.Duration#toString`)는 `PT48H`, `PT1H30M`, `PT0S`처럼 시·분·초로 준다. 날짜(`P2D`)도 읽는다.
 */
const DURATION_PATTERN =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

/** `PT48H` → 48, `PT1H30M` → 1.5. 읽을 수 없으면 null */
export function isoDurationToHours(value: unknown): number | null {
  if (typeof value !== "string" || value === "P" || value.endsWith("T")) {
    return null;
  }
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  const total = days * 24 + hours + minutes / 60 + seconds / 3600;
  return Math.round(total * 1000) / 1000;
}

/** 48 → `PT48H`, 1.5 → `PT90M`, 0 → `PT0S`. 음수·숫자 아님은 null(범위 검사는 backend) */
export function hoursToIsoDuration(hours: number): string | null {
  if (!Number.isFinite(hours) || hours < 0) {
    return null;
  }
  const minutes = Math.round(hours * 60);
  if (minutes === 0) {
    return "PT0S";
  }
  return minutes % 60 === 0 ? `PT${minutes / 60}H` : `PT${minutes}M`;
}
