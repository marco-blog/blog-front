import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";

import type { NextFunction, Request, Response } from "express";
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
/**
 * 외부 글 원문 이동(007 contracts/routes.md): backend가 클릭을 센 뒤 302. 없는 글의 404를 브라우저(`Accept: text/html`)가
 * 받으면 JSON 대신 front의 404 화면을 보낸다(새 탭에 JSON이 보이지 않게). 이 경로 한 곳만 다르게 다룬다.
 * `app/external/visit.ts`의 `VISIT_PATH_PATTERN`과 같은 규칙이다.
 */
const VISIT_PATH = /^\/api\/v1\/external-posts\/[^/]+\/visit$/;

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

/** 이 요청이 HTML 화면을 바라는가(브라우저가 링크를 열 때) */
export function wantsHtml(req: IncomingMessage): boolean {
  const accept = req.headers.accept ?? "";
  return accept.includes("text/html");
}

export function isVisitPath(method: string, pathname: string): boolean {
  const upper = method.toUpperCase();
  return (upper === "GET" || upper === "HEAD") && VISIT_PATH.test(pathname);
}

function onError(_error: Error, req: IncomingMessage, res: ServerResponse | Socket) {
  if ("writeHead" in res) {
    writeProxyError(req, res);
  } else {
    res.destroy();
  }
}

export function backendProxy(target: string) {
  const proxy = createProxyMiddleware<Request, Response>({
    target,
    changeOrigin: true,
    xfwd: true,
    pathFilter: (path, req) => isBackendPath(req.method ?? "GET", pathnameOf(path)),
    on: { error: onError },
  });
  // 외부 글 이동: 응답을 직접 쓴다. 404이고 HTML 요청이면 본문을 버리고 다음 처리기(React Router의 404 화면)로 넘긴다.
  const nextOf = new WeakMap<IncomingMessage, NextFunction>();
  const visitProxy = createProxyMiddleware<Request, Response>({
    target,
    changeOrigin: true,
    xfwd: true,
    selfHandleResponse: true,
    on: {
      error: onError,
      proxyRes: (proxyRes, req, res) => {
        const status = proxyRes.statusCode ?? 502;
        const next = nextOf.get(req);
        if (status === 404 && wantsHtml(req) && next) {
          proxyRes.resume();
          next();
          return;
        }
        res.writeHead(status, proxyRes.headers);
        proxyRes.pipe(res);
      },
    },
  });
  return (req: Request, res: Response, next: NextFunction) => {
    if (isVisitPath(req.method, pathnameOf(req.url))) {
      nextOf.set(req, next);
      return visitProxy(req, res, next);
    }
    return proxy(req, res, next);
  };
}
