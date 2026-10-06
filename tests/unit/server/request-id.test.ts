import { describe, expect, it } from "vitest";

import { isValidRequestId, newRequestId, resolveRequestId } from "~/api/request-id.server";

describe("request id", () => {
  it("backend와 같은 형식만 받는다", () => {
    expect(isValidRequestId("abcdef12")).toBe(true);
    expect(isValidRequestId("4bf92f35-77b3-4da6-a1b2-c3d4e5f60718")).toBe(true);
    expect(isValidRequestId("short")).toBe(false);
    expect(isValidRequestId("a".repeat(65))).toBe(false);
    expect(isValidRequestId("bad id!!")).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId(["abcdef1234567890"])).toBe(false);
  });

  it("새 ID는 16자리 16진수", () => {
    expect(newRequestId()).toMatch(/^[0-9a-f]{16}$/);
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it("맞으면 이어 쓰고 아니면 새로 만든다", () => {
    expect(resolveRequestId("abcdef1234567890")).toBe("abcdef1234567890");
    expect(resolveRequestId(null)).toMatch(/^[0-9a-f]{16}$/);
  });
});
