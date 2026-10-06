import { describe, expect, it } from "vitest";

import { resolveLanguage } from "~/i18n/resolveLanguage.server";

/**
 * 화면 언어 결정(T223, FR-149, US5 AS1): (1) 로그인 회원 `locale` → (2) 쿠키 `lang` → (3) Accept-Language → (4) en.
 * 지원하지 않는 값은 건너뛰고 다음 단계로 간다.
 */
const request = (headers: Record<string, string> = {}) =>
  new Request("http://front.test/", { headers });

describe("resolveLanguage (FR-149)", () => {
  it("(1) 로그인 회원의 언어 설정이 가장 먼저", () => {
    expect(resolveLanguage(request({ cookie: "lang=ja", "accept-language": "en" }), "zh-CN")).toBe(
      "zh-CN",
    );
  });

  it("(2) 회원 설정이 없거나 지원하지 않는 값이면 쿠키 lang", () => {
    expect(resolveLanguage(request({ cookie: "lang=ja", "accept-language": "ko" }), null)).toBe(
      "ja",
    );
    expect(resolveLanguage(request({ cookie: "lang=ja", "accept-language": "ko" }), "xx")).toBe(
      "ja",
    );
    expect(resolveLanguage(request({ cookie: "a=1; lang=zh-CN" }), undefined)).toBe("zh-CN");
  });

  it("(3) 쿠키가 없거나 지원하지 않는 값이면 Accept-Language(q 값 순서)", () => {
    expect(resolveLanguage(request({ cookie: "lang=fr", "accept-language": "ko-KR" }))).toBe("ko");
    expect(resolveLanguage(request({ "accept-language": "fr;q=1, en;q=0.4, ja;q=0.8" }))).toBe(
      "ja",
    );
  });

  it.each([
    ["zh", "zh-CN"],
    ["zh-Hans", "zh-CN"],
    ["zh-Hans-CN", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["en-US", "en"],
    ["en-GB,en;q=0.9", "en"],
    ["ja-JP,ja;q=0.9", "ja"],
    ["ko-KR,ko;q=0.9,en-US;q=0.8", "ko"],
  ])("Accept-Language %s → %s", (header, expected) => {
    expect(resolveLanguage(request({ "accept-language": header }))).toBe(expected);
  });

  it("(4) 아무것도 맞지 않으면 영어", () => {
    expect(resolveLanguage(request({ "accept-language": "fr-FR,de;q=0.5" }))).toBe("en");
    expect(resolveLanguage(request({ "accept-language": "zh-TW" }))).toBe("en");
    expect(resolveLanguage(request({ cookie: "lang=" }))).toBe("en");
    expect(resolveLanguage(request())).toBe("en");
  });
});
