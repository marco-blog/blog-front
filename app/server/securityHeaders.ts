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

export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
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

export interface SecurityHeadersOptions {
  /** 운영(NODE_ENV=production)일 때만 HSTS를 붙인다. */
  production: boolean;
}

/** 요청마다 nonce를 만들어 CSP와 res.locals에 싣고, nosniff·Referrer-Policy·(운영) HSTS를 붙인다. */
export function securityHeaders({ production }: SecurityHeadersOptions) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const nonce = newNonce();
    res.locals[CSP_NONCE_LOCAL] = nonce;
    res.setHeader("Content-Security-Policy", contentSecurityPolicy(nonce));
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
