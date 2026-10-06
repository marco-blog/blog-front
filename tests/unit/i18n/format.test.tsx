// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_ZONE,
  formatDate,
  formatDateTime,
  formatNumber,
  useDateFormat,
} from "~/i18n/format";

import { renderRoutes, testI18n } from "../support/render";

/**
 * 날짜·숫자 표기(T225, FR-153): 화면 언어의 표기 방식과 회원 시간대(비회원 Asia/Seoul).
 */
const ISO = "2026-10-06T04:24:00Z";

describe("formatDate", () => {
  it.each([
    ["ko", "2026년 10월 6일"],
    ["en", "Oct 6, 2026"],
    ["ja", "2026年10月6日"],
    ["zh-CN", "2026年10月6日"],
  ])("%s → %s", (language, expected) => {
    expect(formatDate(ISO, language, "Asia/Seoul")).toBe(expected);
  });

  it("시간대에 따라 날짜가 바뀐다", () => {
    const iso = "2026-10-06T16:00:00Z";
    expect(formatDate(iso, "ko", "Asia/Seoul")).toBe("2026년 10월 7일");
    expect(formatDate(iso, "en", "America/New_York")).toBe("Oct 6, 2026");
  });

  it("잘못된 시간대는 Asia/Seoul로, 값이 없거나 날짜가 아니면 빈 문자열", () => {
    expect(formatDate("2026-10-06T16:00:00Z", "ko", "Not/AZone")).toBe("2026년 10월 7일");
    expect(formatDate(null, "ko", "Asia/Seoul")).toBe("");
    expect(formatDate(undefined, "ko", "Asia/Seoul")).toBe("");
    expect(formatDate("not-a-date", "ko", "Asia/Seoul")).toBe("");
  });
});

describe("formatDateTime", () => {
  it.each([
    ["ko", "Asia/Seoul", "2026년 10월 6일 오후 1:24"],
    ["en", "America/New_York", "Oct 6, 2026, 12:24 AM"],
    ["en", "UTC", "Oct 6, 2026, 4:24 AM"],
    ["ja", "Asia/Seoul", "2026年10月6日 13:24"],
    ["zh-CN", "Asia/Seoul", "2026年10月6日 13:24"],
  ])("%s, %s → %s", (language, timeZone, expected) => {
    expect(formatDateTime(ISO, language, timeZone)).toBe(expected);
  });
});

describe("formatNumber", () => {
  it("화면 언어의 숫자 표기", () => {
    expect(formatNumber(1234567, "ko")).toBe("1,234,567");
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
    expect(formatNumber(0, "ja")).toBe("0");
    expect(formatNumber(null, "ko")).toBe("");
    expect(formatNumber(Number.NaN, "ko")).toBe("");
  });

  it("번역 문구 안의 숫자도 같은 표기({{n, number}})", () => {
    expect(testI18n("en").t("post:views", { views: 12345 })).toBe("Views 12,345");
    expect(testI18n("ko").t("comment:count", { comments: 1000 })).toContain("1,000");
  });
});

function Probe({ iso }: { iso: string }) {
  const format = useDateFormat();
  return (
    <p>
      {format.date(iso)} | {format.dateTime(iso)} | {format.number(4321)}
    </p>
  );
}

describe("useDateFormat", () => {
  it("비회원은 화면 언어와 Asia/Seoul", async () => {
    expect(DEFAULT_TIME_ZONE).toBe("Asia/Seoul");
    renderRoutes([{ index: true, Component: () => <Probe iso={ISO} /> }], { language: "ja" });

    expect(
      await screen.findByText("2026年10月6日 | 2026年10月6日 13:24 | 4,321"),
    ).toBeInTheDocument();
  });

  it("회원 시간대(America/New_York)와 영어 표기", async () => {
    renderRoutes([{ index: true, Component: () => <Probe iso={ISO} /> }], {
      language: "en",
      timeZone: "America/New_York",
    });

    expect(
      await screen.findByText("Oct 6, 2026 | Oct 6, 2026, 12:24 AM | 4,321"),
    ).toBeInTheDocument();
  });
});
