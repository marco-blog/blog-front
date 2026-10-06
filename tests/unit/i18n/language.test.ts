import { describe, expect, it } from "vitest";

import { isSupportedLanguage } from "~/i18n/config";
import {
  languageFromAcceptLanguage,
  matchLanguage,
  readCookie,
  resolveLanguage,
} from "~/i18n/language";

describe("matchLanguage", () => {
  it.each([
    ["ko", "ko"],
    ["ko-KR", "ko"],
    ["EN-us", "en"],
    ["en_GB", "en"],
    ["ja-JP", "ja"],
    ["zh-CN", "zh-CN"],
    ["zh-cn", "zh-CN"],
    ["zh", "zh-CN"],
    ["zh-SG", "zh-CN"],
    ["zh-Hans-CN", "zh-CN"],
    ["zh-TW", null],
    ["zh-Hant", null],
    ["fr-FR", null],
    ["", null],
    [null, null],
  ])("%s → %s", (tag, expected) => {
    expect(matchLanguage(tag)).toBe(expected);
  });
});

describe("languageFromAcceptLanguage", () => {
  it.each([
    ["ko-KR,ko;q=0.9,en-US;q=0.8", "ko"],
    ["fr-FR,fr;q=0.9,ja;q=0.8,en;q=0.7", "ja"],
    ["en;q=0.5, zh-CN;q=0.9", "zh-CN"],
    ["zh-TW,zh;q=0.8", "zh-CN"],
    ["ko;q=0, en", "en"],
    ["ja;q=abc, en;q=0.1", "en"],
    ["fr, de", null],
    ["*", null],
    ["", null],
    [null, null],
  ])("%s → %s", (header, expected) => {
    expect(languageFromAcceptLanguage(header)).toBe(expected);
  });
});

describe("readCookie", () => {
  it("이름이 같은 값을 읽는다", () => {
    expect(readCookie("a=1; lang=ja; b=2", "lang")).toBe("ja");
    expect(readCookie("lang=zh%2DCN", "lang")).toBe("zh-CN");
    expect(readCookie("lang=%E0%A4%A", "lang")).toBe("%E0%A4%A");
    expect(readCookie("xlang=ja; broken", "lang")).toBeNull();
    expect(readCookie(null, "lang")).toBeNull();
  });
});

describe("resolveLanguage (FR-149)", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://front.test/", { headers });

  it("회원 설정이 가장 먼저", () => {
    expect(resolveLanguage(request({ cookie: "lang=ja", "accept-language": "en" }), "zh-CN")).toBe(
      "zh-CN",
    );
  });

  it("다음은 쿠키 lang", () => {
    expect(resolveLanguage(request({ cookie: "lang=ja", "accept-language": "ko" }), "xx")).toBe(
      "ja",
    );
  });

  it("다음은 Accept-Language", () => {
    expect(resolveLanguage(request({ cookie: "lang=fr", "accept-language": "ko-KR" }))).toBe("ko");
  });

  it("모두 없으면 영어", () => {
    expect(resolveLanguage(request({ "accept-language": "fr" }))).toBe("en");
    expect(resolveLanguage(request({}))).toBe("en");
  });
});

describe("isSupportedLanguage", () => {
  it("4개 언어만", () => {
    expect(isSupportedLanguage("zh-CN")).toBe(true);
    expect(isSupportedLanguage("zh")).toBe(false);
    expect(isSupportedLanguage(1)).toBe(false);
  });
});
