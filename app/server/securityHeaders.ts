import { randomBytes } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

/**
 * 보안 헤더(research.md R27, 헌법 원칙 IV). nginx가 아니라 front 서버가 모든 HTML 응답에 붙인다.
 * server.ts가 Node로 바로 불러오므로 `~` 경로 별칭을 쓰지 않는다.
 */

/** 요청별 CSP nonce를 담는 res.locals 키. server/app.ts가 entry.server로 넘긴다. */
export const CSP_NONCE_LOCAL = "cspNonce";

/** 본문에 넣을 수 있는 동영상 iframe 출처(research.md R25) */
export const ALLOWED_FRAME_SOURCES = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
] as const;

/** HSTS 1년(운영만) */
export const HSTS_VALUE = "max-age=31536000";

/** 128비트 무작위 nonce(base64) */
export function newNonce(): string {
  return randomBytes(16).toString("base64");
}

/**
 * 카카오톡 공유 SDK(002 research D9)가 쓰는 출처. `BLOG_KAKAO_JS_KEY`가 있을 때만 CSP에 더한다.
 * SDK 파일 출처는 app/share/kakao.client.ts의 KAKAO_SDK_ORIGIN과 같다(Node가 바로 불러오는 파일이라 여기에 다시 적는다).
 */
export const KAKAO_SCRIPT_ORIGIN = "https://t1.kakaocdn.net";
export const KAKAO_API_ORIGIN = "https://kapi.kakao.com";

export interface ContentSecurityPolicyOptions {
  /** 카카오톡 공유를 켰는지(`BLOG_KAKAO_JS_KEY`가 있음) */
  kakao?: boolean;
}

export function contentSecurityPolicy(
  nonce: string,
  { kakao = false }: ContentSecurityPolicyOptions = {},
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${kakao ? ` ${KAKAO_SCRIPT_ORIGIN}` : ""}`,
    ...(kakao ? [`connect-src 'self' ${KAKAO_API_ORIGIN}`] : []),
    "style-src 'self' 'unsafe-inline'",
    // 외부 이미지는 backend가 받아 /media로 제공한다(R27).
    "img-src 'self' data:",
    `frame-src ${ALLOWED_FRAME_SOURCES.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export interface SecurityHeadersOptions extends ContentSecurityPolicyOptions {
  /** 운영(NODE_ENV=production)일 때만 HSTS를 붙인다. */
  production: boolean;
}

/** 요청마다 nonce를 만들어 CSP와 res.locals에 싣고, nosniff·Referrer-Policy·(운영) HSTS를 붙인다. */
export function securityHeaders({ production, kakao = false }: SecurityHeadersOptions) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const nonce = newNonce();
    res.locals[CSP_NONCE_LOCAL] = nonce;
    res.setHeader("Content-Security-Policy", contentSecurityPolicy(nonce, { kakao }));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (production) {
      res.setHeader("Strict-Transport-Security", HSTS_VALUE);
    }
    next();
  };
}

export function cspNonceOf(res: Pick<Response, "locals">): string | undefined {
  const value: unknown = res.locals[CSP_NONCE_LOCAL];
  return typeof value === "string" ? value : undefined;
}
