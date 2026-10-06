import { describe, expect, it } from "vitest";

import { isSupportedLanguage } from "~/i18n/config";
import { languageFromAcceptLanguage, matchLanguage, readCookie } from "~/i18n/language";

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

describe("isSupportedLanguage", () => {
  it("4개 언어만", () => {
    expect(isSupportedLanguage("zh-CN")).toBe(true);
    expect(isSupportedLanguage("zh")).toBe(false);
    expect(isSupportedLanguage(1)).toBe(false);
  });
});
