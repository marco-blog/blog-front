import { describe, expect, it } from "vitest";

import { localToUtcIso, utcIsoToLocal } from "~/i18n/zonedDateTime";

/** 예약 발행 시각(004 FR-064): `datetime-local`(회원 시간대) ↔ UTC */
describe("zonedDateTime", () => {
  it("Asia/Seoul은 서머타임 없이 9시간", () => {
    expect(localToUtcIso("2026-10-08T09:00", "Asia/Seoul")).toBe("2026-10-08T00:00:00Z");
    expect(localToUtcIso("2026-01-01T00:30", "Asia/Seoul")).toBe("2025-12-31T15:30:00Z");
    expect(utcIsoToLocal("2026-10-08T00:00:00Z", "Asia/Seoul")).toBe("2026-10-08T09:00");
  });

  it("America/New_York: 서머타임 전후 오프셋이 다르다", () => {
    expect(localToUtcIso("2026-03-07T12:00", "America/New_York")).toBe("2026-03-07T17:00:00Z");
    expect(localToUtcIso("2026-03-09T12:00", "America/New_York")).toBe("2026-03-09T16:00:00Z");
    expect(localToUtcIso("2026-11-02T12:00", "America/New_York")).toBe("2026-11-02T17:00:00Z");
  });

  it("America/New_York 경계: 두 번 있는 시각은 앞의 것, 없는 시각도 실제 시각으로", () => {
    // 2026-11-01 01:30은 EDT(05:30Z)와 EST(06:30Z) 두 번 있다
    expect(localToUtcIso("2026-11-01T01:30", "America/New_York")).toBe("2026-11-01T05:30:00Z");
    // 2026-03-08 02:30은 없다(02:00 → 03:00). 실제 있는 시각으로 바꾼다
    const skipped = localToUtcIso("2026-03-08T02:30", "America/New_York");
    expect(skipped).not.toBeNull();
    expect(["2026-03-08T06:30:00Z", "2026-03-08T07:30:00Z"]).toContain(skipped);
  });

  it("datetime-local 왕복", () => {
    for (const zone of ["Asia/Seoul", "America/New_York", "Europe/London", "UTC"]) {
      for (const local of ["2026-01-15T08:05", "2026-07-15T23:59", "2026-12-31T00:00"]) {
        const utc = localToUtcIso(local, zone);
        expect(utcIsoToLocal(utc, zone)).toBe(local);
      }
    }
  });

  it("잘못된 값", () => {
    expect(localToUtcIso("", "Asia/Seoul")).toBeNull();
    expect(localToUtcIso("2026-13-01T00:00", "Asia/Seoul")).toBeNull();
    expect(localToUtcIso("내일 아침", "Asia/Seoul")).toBeNull();
    expect(utcIsoToLocal(null, "Asia/Seoul")).toBe("");
    expect(utcIsoToLocal("not-a-date", "Asia/Seoul")).toBe("");
    // 모르는 시간대는 UTC
    expect(localToUtcIso("2026-10-08T09:00", "Mars/Olympus")).toBe("2026-10-08T09:00:00Z");
  });
});
