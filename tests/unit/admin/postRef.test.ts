import { describe, expect, it } from "vitest";

import { hoursToIsoDuration, isoDurationToHours } from "~/admin/duration";
import { parsePostRef } from "~/admin/postRef";
import { localToUtcIso, utcIsoToLocal } from "~/admin/zonedTime";

/** 콘솔의 글 지정 값(003 T091) */
describe("parsePostRef", () => {
  it.each([
    ["123", 123],
    ["  42 ", 42],
    ["https://blog.java21.net/marco/123", 123],
    ["http://localhost:5173/marco-dev/7?ref=x#comments", 7],
    ["https://blog.java21.net/marco/123/", 123],
    ["/marco/123", 123],
    ["/marco/123?page=2", 123],
  ])("%s → %s", (input, expected) => {
    expect(parsePostRef(input)).toBe(expected);
  });

  it.each([
    [""],
    ["   "],
    [null],
    ["0"],
    ["012"],
    ["99999999999999999999"],
    ["abc"],
    ["/marco"],
    ["/marco/write/123"],
    ["/marco/abc"],
    ["https://blog.java21.net/"],
    ["ftp://blog.java21.net/marco/1"],
    ["javascript:alert(1)"],
    ["marco/123"],
  ])("%s → null", (input) => {
    expect(parsePostRef(input)).toBeNull();
  });
});

describe("zonedTime", () => {
  it("관리자 시간대의 벽시계 시각을 UTC로(서울 +9, 뉴욕 서머타임)", () => {
    expect(localToUtcIso("2026-10-06T09:00", "Asia/Seoul")).toBe("2026-10-06T00:00:00Z");
    expect(localToUtcIso("2026-07-01T12:30", "America/New_York")).toBe("2026-07-01T16:30:00Z");
    expect(localToUtcIso("2026-12-01T12:30:15", "America/New_York")).toBe("2026-12-01T17:30:15Z");
    expect(localToUtcIso("2026-10-06T09:00", "Not/AZone")).toBe("2026-10-06T09:00:00Z");
  });

  it("형식이 틀리면 null", () => {
    expect(localToUtcIso("", "Asia/Seoul")).toBeNull();
    expect(localToUtcIso(null, "Asia/Seoul")).toBeNull();
    expect(localToUtcIso("2026-13-01T00:00", "Asia/Seoul")).toBeNull();
    expect(localToUtcIso("2026-10-06T24:00", "Asia/Seoul")).toBeNull();
    expect(localToUtcIso("2026-10-06 09:00", "Asia/Seoul")).toBeNull();
  });

  it("UTC 시각을 datetime-local 값으로", () => {
    expect(utcIsoToLocal("2026-10-06T00:00:00Z", "Asia/Seoul")).toBe("2026-10-06T09:00");
    expect(utcIsoToLocal("2026-10-06T23:59:00Z", "UTC")).toBe("2026-10-06T23:59");
    expect(utcIsoToLocal("2026-10-06T00:00:00Z", "Not/AZone")).toBe("2026-10-06T00:00");
    expect(utcIsoToLocal("bad", "Asia/Seoul")).toBe("");
    expect(utcIsoToLocal(null, "Asia/Seoul")).toBe("");
  });
});

describe("duration", () => {
  it.each([
    ["PT48H", 48],
    ["PT1H30M", 1.5],
    ["PT0S", 0],
    ["PT90M", 1.5],
    ["P2D", 48],
    ["P1DT12H", 36],
    ["PT3600S", 1],
  ])("%s → %s시간", (iso, hours) => {
    expect(isoDurationToHours(iso)).toBe(hours);
  });

  it.each([["P"], ["PT"], ["48"], ["-PT1H"], [null], [48]])("%s는 읽지 않는다", (value) => {
    expect(isoDurationToHours(value)).toBeNull();
  });

  it("시간 → ISO 기간", () => {
    expect(hoursToIsoDuration(48)).toBe("PT48H");
    expect(hoursToIsoDuration(1.5)).toBe("PT90M");
    expect(hoursToIsoDuration(0)).toBe("PT0S");
    expect(hoursToIsoDuration(-1)).toBeNull();
    expect(hoursToIsoDuration(Number.NaN)).toBeNull();
  });
});
