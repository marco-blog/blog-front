import { describe, expect, it } from "vitest";

import { DEFAULT_BACKEND_URL, backendUrl, captchaTurnstile } from "~/config.server";

describe("backendUrl", () => {
  it("값이 없으면 기본값", () => {
    expect(backendUrl({})).toBe(DEFAULT_BACKEND_URL);
    expect(backendUrl({ BLOG_BACKEND_URL: "  " })).toBe(DEFAULT_BACKEND_URL);
  });

  it("끝의 /를 뗀다", () => {
    expect(backendUrl({ BLOG_BACKEND_URL: "http://backend:8080//" })).toBe("http://backend:8080");
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
