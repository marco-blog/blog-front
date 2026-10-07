import { vi } from "vitest";

import type { ApiFieldError } from "~/api/types";

/**
 * contracts/api.md의 공통 응답 틀로 backend를 흉내 낸다.
 * 전역 fetch를 바꾸므로 SSR 클라이언트(client.server.ts)와 브라우저 클라이언트(client.ts) 모두 이 응답을 받는다.
 */
export interface BackendCall {
  method: string;
  /** /api/v1/... 경로 */
  path: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export type BackendHandler = (call: BackendCall) => Response | Promise<Response>;

interface OkInit {
  status?: number;
  totalCount?: number;
  headers?: HeadersInit;
}

export function ok(result: unknown, init: OkInit = {}): Response {
  const body: Record<string, unknown> = {
    header: { isSuccessful: true, resultCode: "OK", resultMessage: "" },
    result,
  };
  if (init.totalCount !== undefined) {
    body.totalCount = init.totalCount;
  }
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function fail(
  status: number,
  resultCode: string,
  fieldErrors: ApiFieldError[] = [],
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json");
  return new Response(
    JSON.stringify({
      header: {
        isSuccessful: false,
        resultCode,
        resultMessage: "debug message that must not be shown",
        ...(fieldErrors.length > 0 ? { fieldErrors } : {}),
        traceId: "trace-0000",
      },
      result: null,
    }),
    { status, headers: responseHeaders },
  );
}

/** 오류 상세 값(`header.params`, 007)을 실은 실패 응답 */
export function failWithParams(
  status: number,
  resultCode: string,
  params: Record<string, unknown>,
  fieldErrors: ApiFieldError[] = [],
): Response {
  return new Response(
    JSON.stringify({
      header: {
        isSuccessful: false,
        resultCode,
        resultMessage: "debug message that must not be shown",
        ...(fieldErrors.length > 0 ? { fieldErrors } : {}),
        params,
        traceId: "trace-0000",
      },
      result: null,
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function toUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input, "http://front.test");
  return new URL(input.url);
}

function parseBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") return body ?? undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/**
 * `"METHOD /api/v1/path"` → 응답(또는 처리 함수). 등록하지 않은 호출은 404 `UNMOCKED`로 답한다.
 * 같은 키를 여러 번 부르면 처리 함수가 매번 불린다(Response 값은 복제해 돌려준다).
 */
export function mockBackend(routes: Record<string, BackendHandler | Response> = {}) {
  const calls: BackendCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);
    const call: BackendCall = {
      method: (init?.method ?? "GET").toUpperCase(),
      path: url.pathname,
      url,
      headers: new Headers(init?.headers),
      body: parseBody(init?.body),
    };
    calls.push(call);
    const handler = routes[`${call.method} ${call.path}`];
    if (!handler) {
      return fail(404, "UNMOCKED");
    }
    return typeof handler === "function" ? handler(call) : handler.clone();
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    fetch: fetchMock,
    /** 경로가 같은 호출 */
    callsTo: (key: string) => calls.filter((call) => `${call.method} ${call.path}` === key),
  };
}
