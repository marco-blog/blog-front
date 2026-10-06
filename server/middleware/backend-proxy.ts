import type { IncomingMessage, ServerResponse } from "node:http";

import type { Request, Response } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";

/**
 * front 서버가 backend로 넘기는 경로(001 contracts/routes.md "프록시" 표).
 * - `/api/**`, `/media/**`
 * - 피드: `/:handle/rss`, `/:handle/atom`, `/:handle/category/:categoryId/rss` (002)
 * - 트랙백 받기: `POST /:handle/:postId/trackback` (005)
 * - `/sitemap.xml`, `/sitemap/**`, `/robots.txt` (002)
 */
const ANY_METHOD_PATHS = [/^\/api(?:\/|$)/, /^\/media(?:\/|$)/];
const READ_PATHS = [
  /^\/[^/]+\/(?:rss|atom)$/,
  /^\/[^/]+\/category\/\d+\/rss$/,
  /^\/sitemap\.xml$/,
  /^\/sitemap\/.+/,
  /^\/robots\.txt$/,
];
const TRACKBACK_PATH = /^\/[^/]+\/\d+\/trackback$/;

export function isBackendPath(method: string, pathname: string): boolean {
  if (ANY_METHOD_PATHS.some((pattern) => pattern.test(pathname))) {
    return true;
  }
  const upper = method.toUpperCase();
  if (upper === "GET" || upper === "HEAD") {
    return READ_PATHS.some((pattern) => pattern.test(pathname));
  }
  return upper === "POST" && TRACKBACK_PATH.test(pathname);
}

function pathnameOf(url: string): string {
  const query = url.indexOf("?");
  return query === -1 ? url : url.slice(0, query);
}

/** backend에 닿지 못했을 때의 응답. API는 공통 응답 틀(api-guidelines.md 4절)로 준다. */
export function writeProxyError(req: IncomingMessage, res: ServerResponse): void {
  if (res.headersSent || res.writableEnded) {
    res.end();
    return;
  }
  const traceId = res.getHeader("X-Request-Id");
  if (/^\/api(?:\/|$)/.test(pathnameOf(req.url ?? ""))) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        header: {
          isSuccessful: false,
          resultCode: "BACKEND_UNAVAILABLE",
          resultMessage: "Backend unavailable",
          ...(typeof traceId === "string" ? { traceId } : {}),
        },
        result: null,
      }),
    );
    return;
  }
  res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Bad Gateway");
}

export function backendProxy(target: string) {
  return createProxyMiddleware<Request, Response>({
    target,
    changeOrigin: true,
    xfwd: true,
    pathFilter: (path, req) => isBackendPath(req.method ?? "GET", pathnameOf(path)),
    on: {
      error: (_error, req, res) => {
        if ("writeHead" in res) {
          writeProxyError(req, res);
        } else {
          res.destroy();
        }
      },
    },
  });
}
