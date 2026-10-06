import { describe, expect, it } from "vitest";

import { createLoadContext, cspNonceContext } from "~/server/requestContext";

describe("createLoadContext", () => {
  it("보안 헤더 미들웨어가 정한 nonce를 entry.server로 넘긴다", () => {
    expect(createLoadContext("abc").get(cspNonceContext)).toBe("abc");
  });

  it("nonce가 없으면 undefined", () => {
    expect(createLoadContext(undefined).get(cspNonceContext)).toBeUndefined();
  });
});
