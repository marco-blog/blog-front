import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterEach, describe, expect, it } from "vitest";

import {
  CSP_NONCE_LOCAL,
  contentSecurityPolicy,
  cspNonceOf,
  KAKAO_API_ORIGIN,
  KAKAO_SCRIPT_ORIGIN,
  securityHeaders,
} from "~/server/securityHeaders";
import { KAKAO_SDK_ORIGIN, KAKAO_SDK_URL } from "~/share/kakao.client";

/** 보안 헤더(research.md R27, 헌법 원칙 IV) */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .filter((tokens) => tokens[0])
      .map(([name, ...values]) => [name, values]),
  );
}

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** 보안 헤더 미들웨어 뒤에서 HTML을 그리는 앱. 본문의 script에 미들웨어가 정한 nonce를 넣는다. */
async function start(production: boolean, kakao?: boolean): Promise<string> {
  const app = express();
  app.use(securityHeaders(kakao === undefined ? { production } : { production, kakao }));
  app.get("/", (_req, res) => {
    res
      .type("html")
      .send(`<!doctype html><script nonce="${cspNonceOf(res)}">window.ok = true</script>`);
  });
  server = createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

describe("contentSecurityPolicy", () => {
  it("R27 정책을 그대로 만든다", () => {
    const policy = directives(contentSecurityPolicy("abc123"));

    expect(Object.fromEntries(policy)).toEqual({
      "default-src": ["'self'"],
      "script-src": ["'self'", "'nonce-abc123'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:"],
      "frame-src": ["https://www.youtube-nocookie.com", "https://player.vimeo.com"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it("script-src에 'unsafe-inline'·외부 도메인을 넣지 않는다", () => {
    const scriptSrc = directives(contentSecurityPolicy("n")).get("script-src") ?? [];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc.filter((value) => value.startsWith("http"))).toEqual([]);
  });
});

describe("contentSecurityPolicy: 카카오톡 공유(002 T077, research D9)", () => {
  it("키가 있으면 script-src에 SDK 출처, connect-src에 'self'와 카카오 API를 더한다", () => {
    const policy = directives(contentSecurityPolicy("abc123", { kakao: true }));

    expect(policy.get("script-src")).toEqual([
      "'self'",
      "'nonce-abc123'",
      "https://t1.kakaocdn.net",
    ]);
    expect(policy.get("connect-src")).toEqual(["'self'", "https://kapi.kakao.com"]);
    expect(policy.get("script-src")).not.toContain("'unsafe-inline'");
    // 나머지는 001과 같다.
    const base = directives(contentSecurityPolicy("abc123"));
    for (const [name, values] of base) {
      if (name !== "script-src") {
        expect(policy.get(name)).toEqual(values);
      }
    }
  });

  it("키가 없으면 001과 같은 CSP", () => {
    expect(contentSecurityPolicy("n", { kakao: false })).toBe(contentSecurityPolicy("n"));
    expect(directives(contentSecurityPolicy("n")).has("connect-src")).toBe(false);
  });

  it("SDK 출처는 kakao.client.ts의 주소와 같다", () => {
    expect(KAKAO_SDK_URL.startsWith(`${KAKAO_SCRIPT_ORIGIN}/`)).toBe(true);
    expect(KAKAO_SCRIPT_ORIGIN).toBe(KAKAO_SDK_ORIGIN);
    expect(KAKAO_API_ORIGIN).toBe("https://kapi.kakao.com");
  });

  it("미들웨어도 kakao 옵션에 따라 헤더를 만든다", async () => {
    const url = await start(false, true);
    const policy = directives((await fetch(url)).headers.get("content-security-policy") ?? "");
    expect(policy.get("script-src")).toContain("https://t1.kakaocdn.net");
    expect(policy.get("connect-src")).toEqual(["'self'", "https://kapi.kakao.com"]);
  });
});

describe("securityHeaders", () => {
  it("HTML 응답에 CSP·nosniff·Referrer-Policy를 붙이고, nonce는 본문 script와 같다", async () => {
    const url = await start(false);

    const response = await fetch(url);
    const html = await response.text();

    const policy = directives(response.headers.get("content-security-policy") ?? "");
    const nonce = /<script nonce="([^"]+)">/.exec(html)?.[1];
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(policy.get("script-src")).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("frame-src")).toEqual([
      "https://www.youtube-nocookie.com",
      "https://player.vimeo.com",
    ]);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("nonce는 요청마다 다르다", async () => {
    const url = await start(false);

    const [first, second] = await Promise.all([fetch(url), fetch(url)]);

    expect(first.headers.get("content-security-policy")).not.toBe(
      second.headers.get("content-security-policy"),
    );
  });

  it("HSTS는 운영에서만 붙인다", async () => {
    const devUrl = await start(false);
    expect((await fetch(devUrl)).headers.get("strict-transport-security")).toBeNull();
    await new Promise<void>((resolve) => server!.close(() => resolve()));

    const prodUrl = await start(true);
    expect((await fetch(prodUrl)).headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
  });

  it("nonce는 res.locals에 담는다", () => {
    const res = { locals: { [CSP_NONCE_LOCAL]: "xyz" } } as unknown as express.Response;
    expect(cspNonceOf(res)).toBe("xyz");
    expect(cspNonceOf({ locals: {} } as unknown as express.Response)).toBeUndefined();
  });
});
