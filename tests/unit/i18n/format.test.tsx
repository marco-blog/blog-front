// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_TIME_ZONE,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  useRelativeTime,
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

/** 상대 시각(003 T041, research P7, 결정 표 23번) */
describe("formatRelativeTime", () => {
  const NOW = "2026-10-06T12:00:00Z";
  const ago = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();
  const MIN = 60_000;

  it.each([
    ["ko", "지금", "5분 전", "3시간 전", "1일 전", "6일 전"],
    ["en", "now", "5 minutes ago", "3 hours ago", "1 day ago", "6 days ago"],
    ["ja", "今", "5 分前", "3 時間前", "1 日前", "6 日前"],
    ["zh-CN", "现在", "5分钟前", "3小时前", "1天前", "6天前"],
  ])("%s: 방금·N분·N시간·N일 전", (language, now, minutes, hours, day, days) => {
    expect(formatRelativeTime(ago(30_000), NOW, language)).toBe(now);
    expect(formatRelativeTime(ago(5 * MIN + 10_000), NOW, language)).toBe(minutes);
    expect(formatRelativeTime(ago(3 * 60 * MIN + MIN), NOW, language)).toBe(hours);
    expect(formatRelativeTime(ago(25 * 60 * MIN), NOW, language)).toBe(day);
    expect(formatRelativeTime(ago(6 * 24 * 60 * MIN), NOW, language)).toBe(days);
  });

  it("7일을 넘으면 날짜, 미래는 방금, 잘못된 값은 빈 문자열", () => {
    expect(formatRelativeTime("2026-09-20T00:00:00Z", NOW, "ko")).toBe("2026년 9월 20일");
    expect(formatRelativeTime("2026-09-20T00:00:00Z", new Date(NOW), "en", "UTC")).toBe(
      "Sep 20, 2026",
    );
    expect(formatRelativeTime("2026-10-06T12:05:00Z", NOW, "ko")).toBe("지금");
    expect(formatRelativeTime(null, NOW, "ko")).toBe("");
    expect(formatRelativeTime("bad", NOW, "ko")).toBe("");
    expect(formatRelativeTime(ago(0), "bad", "ko")).toBe("");
  });

  it("서버 시각 기준이라 브라우저 시각과 무관하게 같은 결과(SSR·hydration 일치)", async () => {
    function Relative() {
      const relative = useRelativeTime(NOW);
      return <p>{relative(ago(2 * 60 * MIN))}</p>;
    }
    renderRoutes([{ index: true, Component: Relative }], { language: "ko" });
    expect(await screen.findByText("2시간 전")).toBeInTheDocument();
  });
});
