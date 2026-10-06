import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, type EntryContext, type RouterContextProvider } from "react-router";

import { cspNonceContext } from "~/server/requestContext";

/**
 * React Router 기본 서버 진입점(Node)에 CSP nonce만 더했다(research.md R27).
 * nonce는 server.ts의 보안 헤더 미들웨어가 요청마다 만들어 CSP 헤더와 load context에 싣는다.
 * `<ServerRouter nonce>`가 `<Scripts>`·`<ScrollRestoration>`·`<Links>`의 기본 nonce가 된다.
 */
export const streamTimeout = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  // https://httpwg.org/specs/rfc9110.html#HEAD
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  const nonce = loadContext.get(cspNonceContext);

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    // 검색 로봇과 SPA 모드는 모든 내용이 준비될 때까지 기다린다.
    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
      {
        nonce,
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          // 셸 안의 스트리밍 오류만 기록한다. 셸 오류는 reject되어 handleDocumentRequest가 기록한다.
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
}
