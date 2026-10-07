import { describe, expect, it } from "vitest";

import { DEFAULT_BACKEND_URL, backendUrl, captchaTurnstile, kakaoJsKey } from "~/config.server";

describe("backendUrl", () => {
  it("값이 없으면 기본값", () => {
    expect(backendUrl({})).toBe(DEFAULT_BACKEND_URL);
    expect(backendUrl({ BLOG_BACKEND_URL: "  " })).toBe(DEFAULT_BACKEND_URL);
  });

  it("끝의 /를 뗀다", () => {
    expect(backendUrl({ BLOG_BACKEND_URL: "http://backend:8080//" })).toBe("http://backend:8080");
  });
});

describe("kakaoJsKey", () => {
  it("값이 없거나 비었으면 null(카카오톡 공유 버튼을 숨긴다)", () => {
    expect(kakaoJsKey({})).toBeNull();
    expect(kakaoJsKey({ BLOG_KAKAO_JS_KEY: "" })).toBeNull();
    expect(kakaoJsKey({ BLOG_KAKAO_JS_KEY: "   " })).toBeNull();
  });

  it("앞뒤 공백을 뺀 값", () => {
    expect(kakaoJsKey({ BLOG_KAKAO_JS_KEY: " abc123 " })).toBe("abc123");
  });
});

describe("captchaTurnstile (005)", () => {
  it("BLOG_CAPTCHA_PROVIDER가 turnstile일 때만 true", () => {
    expect(captchaTurnstile({})).toBe(false);
    expect(captchaTurnstile({ BLOG_CAPTCHA_PROVIDER: "test" })).toBe(false);
    expect(captchaTurnstile({ BLOG_CAPTCHA_PROVIDER: "none" })).toBe(false);
    expect(captchaTurnstile({ BLOG_CAPTCHA_PROVIDER: " Turnstile " })).toBe(true);
  });
});
