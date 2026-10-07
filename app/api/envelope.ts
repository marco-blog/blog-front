import { ApiError, CLIENT_ERROR_CODES } from "./errors";
import { isApiEnvelope } from "./types";

/** 모든 API는 /api/v1 아래에 있다(api-guidelines.md 1절). */
export const API_PREFIX = "/api/v1";

/** 접근 토큰이 없거나 만료되었을 때의 오류 코드. 이때만 리프레시한다. */
export const UNAUTHENTICATED = "UNAUTHENTICATED";

export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue | QueryValue[]>;

export interface ApiRequestInit {
  method?: string;
  query?: Query;
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
  /** backend 응답 헤더 */
  headers: Headers;
}

/** `/api/v1{path}?query`. 여러 값은 쉼표로 보낸다(api-guidelines.md 6절). 빈 값은 뺀다. */
export function apiPath(path: string, query: Query | undefined): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    const values = (Array.isArray(value) ? value : [value]).filter(
      (item): item is string | number | boolean => item !== null && item !== undefined,
    );
    if (values.length > 0) {
      params.set(key, values.join(","));
    }
  }
  const search = params.toString();
  return `${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}${search ? `?${search}` : ""}`;
}

/** 본문(JSON 또는 FormData)과 그에 맞는 content-type */
export function encodeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body instanceof FormData) {
    return body;
  }
  if (body === undefined) {
    return undefined;
  }
  headers.set("content-type", "application/json");
  return JSON.stringify(body);
}

/** backend에 닿지 못했을 때 */
export function unavailable(cause: unknown, traceId?: string): ApiError {
  return new ApiError({
    status: 502,
    resultCode: CLIENT_ERROR_CODES.BACKEND_UNAVAILABLE,
    resultMessage: cause instanceof Error ? cause.message : String(cause),
    traceId,
  });
}

/**
 * 공통 응답 틀(api-guidelines.md 4절)을 벗겨 result를 돌려준다.
 * 실패(header.isSuccessful=false, 2xx 아님)와 공통 틀이 아닌 응답은 ApiError로 던진다.
 */
export async function readEnvelope<T>(
  response: Response,
  path: string,
  traceId?: string,
): Promise<ApiResult<T>> {
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
      retryAfter: retryAfterSeconds(response.headers.get("retry-after")),
      params: header.params,
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

/** `Retry-After`(초 단위 정수만 받는다). 없거나 날짜 형식이면 null */
export function retryAfterSeconds(value: string | null): number | null {
  if (value === null || !/^\d{1,9}$/.test(value.trim())) {
    return null;
  }
  return Number(value.trim());
}

/** 리프레시로 풀 수 있는 401인지 */
export function isExpiredAccess(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401 && error.resultCode === UNAUTHENTICATED;
}

/** 리프레시하지 않는 경로(로그인·가입·리프레시·로그아웃 자체) */
export function isAuthPath(path: string): boolean {
  return /^\/?auth(?:\/|$)/.test(path);
}
