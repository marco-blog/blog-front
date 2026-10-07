import { describe, expect, it } from "vitest";

import { durationParts, formatBytes, formatDuration, parseIsoDuration } from "~/admin/format";

import { testI18n } from "../support/render";

/** 크기·기간 표시(006 T038) */
describe("admin format", () => {
  it("바이트는 1024배 단위, 소수 한 자리", () => {
    expect(formatBytes(10 * 1024 * 1024, "ko")).toBe("10 MB");
    expect(formatBytes(200 * 1024 * 1024, "en")).toBe("200 MB");
    expect(formatBytes(1536, "en")).toBe("1.5 KB");
    expect(formatBytes(512, "en")).toBe("512 B");
    expect(formatBytes(5 * 1024 ** 5, "en")).toBe("5,120 TB");
    expect(formatBytes(-1, "en")).toBe("-1");
  });

  it("ISO 기간을 초로", () => {
    expect(parseIsoDuration("PT8760H")).toBe(365 * 86400);
    expect(parseIsoDuration("P1D")).toBe(86400);
    expect(parseIsoDuration("PT5M")).toBe(300);
    expect(parseIsoDuration("PT0S")).toBe(0);
    expect(parseIsoDuration("PT1.5S")).toBe(1.5);
    expect(parseIsoDuration("P")).toBeNull();
    expect(parseIsoDuration("PT")).toBeNull();
    expect(parseIsoDuration("5m")).toBeNull();
    expect(parseIsoDuration(null)).toBeNull();
  });

  it("나누어떨어지는 가장 큰 단위", () => {
    expect(durationParts(365 * 86400)).toEqual({ unit: "days", count: 365 });
    expect(durationParts(24 * 3600 + 3600)).toEqual({ unit: "hours", count: 25 });
    expect(durationParts(300)).toEqual({ unit: "minutes", count: 5 });
    expect(durationParts(61)).toEqual({ unit: "seconds", count: 61 });
    expect(durationParts(0)).toEqual({ unit: "seconds", count: 0 });
  });

  it("화면 언어 문구(복수형)", () => {
    expect(formatDuration(testI18n("ko").t, "PT8760H")).toBe("365일");
    expect(formatDuration(testI18n("en").t, "PT24H")).toBe("1 day");
    expect(formatDuration(testI18n("en").t, "PT5M")).toBe("5 minutes");
    expect(formatDuration(testI18n("ja").t, "PT1H")).toBe("1時間");
    expect(formatDuration(testI18n("zh-CN").t, "PT30S")).toBe("30 秒");
    expect(formatDuration(testI18n("en").t, "soon")).toBe("soon");
  });
});
