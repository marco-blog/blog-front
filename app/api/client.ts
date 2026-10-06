import { redirectToLogin, refreshGeneration, refreshSession } from "~/auth/refresh.client";

import {
  apiPath,
  encodeBody,
  isAuthPath,
  isExpiredAccess,
  readEnvelope,
  unavailable,
  type ApiRequestInit,
  type ApiResult,
} from "./envelope";

export interface BrowserApiOptions {
  /** 기본값은 전역 fetch(호출할 때 읽는다) */
  fetch?: typeof fetch;
  /** 리프레시도 실패했을 때. 기본은 `/login?next={지금 주소}`로 이동 */
  onSessionExpired?: () => void;
}

export type BrowserApi = ReturnType<typeof createBrowserApi>;

/**
 * 브라우저에서 backend API를 부르는 클라이언트(자동저장, 발행, 주소 확인 등).
 * 같은 출처의 `/api/v1/...`로 보내면 front 서버가 backend로 프록시하고, 쿠키는 브라우저가 싣는다.
 * 401 `UNAUTHENTICATED`면 리프레시를 한 번 하고(동시 요청은 하나로 합침) 원 요청을 다시 보낸다.
 * 리프레시도 실패하면 로그인 화면으로 보낸다(T070).
 */
export function createBrowserApi(options: BrowserApiOptions = {}) {
  const fetchImpl = (): typeof fetch => options.fetch ?? globalThis.fetch;

  async function exchange(path: string, init: ApiRequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    const body = encodeBody(init.body, headers);
    try {
      return await fetchImpl()(apiPath(path, init.query), {
        method: (init.method ?? "GET").toUpperCase(),
        headers,
        body,
        signal: init.signal,
        credentials: "same-origin",
      });
    } catch (cause) {
      throw unavailable(cause);
    }
  }

  async function send<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
    const sentAt = refreshGeneration();
    try {
      return await readEnvelope<T>(await exchange(path, init), path);
    } catch (error) {
      if (!isExpiredAccess(error) || isAuthPath(path)) {
        throw error;
      }
      if (await refreshSession(fetchImpl(), sentAt)) {
        try {
          return await readEnvelope<T>(await exchange(path, init), path);
        } catch (retryError) {
          if (isExpiredAccess(retryError)) {
            (options.onSessionExpired ?? redirectToLogin)();
          }
          throw retryError;
        }
      }
      (options.onSessionExpired ?? redirectToLogin)();
      throw error;
    }
  }

  const call =
    (method: string) =>
    async <T>(path: string, init: Omit<ApiRequestInit, "method"> = {}): Promise<T> =>
      (await send<T>(path, { ...init, method })).result;

  return {
    send,
    get: call("GET"),
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    delete: call("DELETE"),
  };
}

/** 화면에서 쓰는 기본 클라이언트 */
export const api = createBrowserApi();
