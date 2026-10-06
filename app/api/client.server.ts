import { backendUrl } from "~/config.server";

import { ApiError, CLIENT_ERROR_CODES } from "./errors";
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id.server";
import { isApiEnvelope } from "./types";

/** 모든 API는 /api/v1 아래에 있다(api-guidelines.md 1절). */
export const API_PREFIX = "/api/v1";

/** 브라우저 요청에서 backend로 그대로 넘기는 헤더. 쿠키(토큰), 언어, CSRF 검사용 Origin. */
const FORWARDED_HEADERS = ["cookie", "accept-language", "origin", "user-agent"] as const;

type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestInit {
  method?: string;
  query?: Record<string, QueryValue | QueryValue[]>;
  /** JSON으로 보낸다. FormData는 그대로 보낸다. */
  body?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export interface ApiResult<T> {
  result: T;
  totalCount?: number;
  nextCursor?: string | null;
  status: number;
  /** backend 응답 헤더(Set-Cookie를 브라우저 응답에 옮길 때 쓴다) */
  headers: Headers;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createApiClient>;

function buildUrl(baseUrl: string, path: string, query: ApiRequestInit["query"]): string {
  const url = new URL(`${baseUrl}${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    const values = (Array.isArray(value) ? value : [value]).filter(
      (item): item is string | number | boolean => item !== null && item !== undefined,
    );
    if (values.length > 0) {
      // 여러 값은 쉼표로 보낸다(api-guidelines.md 6절).
      url.searchParams.set(key, values.join(","));
    }
  }
  return url.toString();
}

/**
 * SSR loader·action에서 backend를 직접 호출하는 클라이언트.
 * 들어온 요청의 쿠키·언어·Origin과 X-Request-Id를 backend로 전달하고,
 * 공통 응답 틀의 result를 꺼내 준다. 실패하면 ApiError를 던진다.
 */
export function createApiClient(request: Request, options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? backendUrl()).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));

  async function send<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
    const headers = new Headers(init.headers);
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null && !headers.has(name)) {
        headers.set(name, value);
      }
    }
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set("accept", "application/json");

    let body: BodyInit | undefined;
    if (init.body instanceof FormData) {
      body = init.body;
    } else if (init.body !== undefined) {
      body = JSON.stringify(init.body);
      headers.set("content-type", "application/json");
    }

    let response: Response;
    try {
      response = await fetchImpl(buildUrl(baseUrl, path, init.query), {
        method: init.method ?? "GET",
        headers,
        body,
        signal: init.signal,
        redirect: "manual",
      });
    } catch (cause) {
      throw new ApiError({
        status: 502,
        resultCode: CLIENT_ERROR_CODES.BACKEND_UNAVAILABLE,
        resultMessage: cause instanceof Error ? cause.message : String(cause),
        traceId: requestId,
      });
    }

    const traceId = response.headers.get(REQUEST_ID_HEADER) ?? requestId;
    const envelope: unknown = await response.json().catch(() => undefined);
    if (!isApiEnvelope(envelope)) {
      throw new ApiError({
        status: response.ok ? 502 : response.status,
        resultCode: CLIENT_ERROR_CODES.INVALID_RESPONSE,
        resultMessage: `Unexpected response from ${path}`,
        traceId,
      });
    }

    const { header } = envelope;
    if (!header.isSuccessful || !response.ok) {
      throw new ApiError({
        status: response.ok ? 502 : response.status,
        resultCode: header.isSuccessful ? CLIENT_ERROR_CODES.INVALID_RESPONSE : header.resultCode,
        resultMessage: header.resultMessage,
        fieldErrors: header.fieldErrors,
        traceId: header.traceId ?? traceId,
      });
    }

    return {
      result: envelope.result as T,
      totalCount: envelope.totalCount,
      nextCursor: envelope.nextCursor,
      status: response.status,
      headers: response.headers,
    };
  }

  const call =
    (method: string) =>
    async <T>(path: string, init: Omit<ApiRequestInit, "method"> = {}): Promise<T> =>
      (await send<T>(path, { ...init, method })).result;

  return {
    requestId,
    send,
    get: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    delete: call("DELETE"),
  };
}
