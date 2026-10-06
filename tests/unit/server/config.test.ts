import { describe, expect, it } from "vitest";

import { DEFAULT_BACKEND_URL, backendUrl } from "~/config.server";

describe("backendUrl", () => {
  it("값이 없으면 기본값", () => {
    expect(backendUrl({})).toBe(DEFAULT_BACKEND_URL);
    expect(backendUrl({ BLOG_BACKEND_URL: "  " })).toBe(DEFAULT_BACKEND_URL);
  });

  it("끝의 /를 뗀다", () => {
    expect(backendUrl({ BLOG_BACKEND_URL: "http://backend:8080//" })).toBe("http://backend:8080");
  });
});
