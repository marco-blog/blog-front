import { backendUrl, publicOrigin } from "~/config.server";

import {
  REFRESH_TOKEN_COOKIE,
  backendSession,
  hasCookie,
  recordSetCookies,
  type BackendSession,
} from "./backendCookies.server";
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
import { REQUEST_ID_HEADER, resolveRequestId } from "./request-id.server";

export { API_PREFIX, type ApiRequestInit, type ApiResult } from "./envelope";

/**
 * 브라우저 요청에서 backend로 그대로 넘기는 헤더. 언어, CSRF 검사용 Origin, User-Agent, 그리고
 * 방문자 주소·원래 scheme(X-Forwarded-For·X-Forwarded-Proto, front 서버 미들웨어 `server/middleware/forwarded.ts`가
 * 접속 주소를 붙여 둔 값. backend는 믿는 프록시가 보낸 것만 쓴다). 쿠키는 따로 다룬다.
 */
const FORWARDED_HEADERS = [
  "accept-language",
  "origin",
  "user-agent",
  "x-forwarded-for",
  "x-forwarded-proto",
] as const;

/** 요청 메모 대상(쿼리·헤더 없는 블로그 정보 조회) */
const MEMO_PATH = /^\/blogs\/([a-z0-9-]{1,40})$/;
/** 구독·구독 취소(블로그 구독자 수가 바뀐다) */
const SUBSCRIPTION_PATH = /^\/me\/subscriptions\/([a-z0-9-]{1,40})$/;

function isMemoizable(path: string, init: Omit<ApiRequestInit, "method">): boolean {
  return MEMO_PATH.test(path) && !init.query && !init.headers && !init.signal;
}

/** 상태를 바꾸지 않는 메서드. 나머지는 backend Origin 검사 대상이다(research.md R3). */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * SSR loader·action에서 backend를 직접 호출하는 클라이언트.
 * 들어온 요청의 쿠키·언어·Origin과 X-Request-Id를 backend로 전달하고,
 * 공통 응답 틀의 result를 꺼내 준다. 실패하면 ApiError를 던진다.
 *
 * 접근 토큰이 만료되어 401 `UNAUTHENTICATED`를 받으면 들어온 리프레시 쿠키로 `POST /auth/refresh`를
 * 요청당 한 번 부르고 원 요청을 다시 보낸다. 새 쿠키는 root 미들웨어가 브라우저 응답에 싣는다
 * (tasks.md "구현 전 결정 사항" 1번, backendCookies.server.ts).
 */
export function createApiClient(request: Request, options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? backendUrl()).replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? fetch;
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER));
  const session = backendSession(request);

  function baseHeaders(method: string, init?: HeadersInit): Headers {
    const headers = new Headers(init);
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null && !headers.has(name)) {
        headers.set(name, value);
      }
    }
    if (session.cookie && !headers.has("cookie")) {
      headers.set("cookie", session.cookie);
    }
    // front 서버가 스스로 보내는 상태 변경 요청(리프레시·조회수)에는 브라우저 Origin이 없으므로 자기 출처를 싣는다.
    if (!SAFE_METHODS.has(method) && !headers.has("origin")) {
      headers.set("origin", publicOrigin(request));
    }
    headers.set(REQUEST_ID_HEADER, requestId);
    headers.set("accept", "application/json");
    return headers;
  }

  async function exchange(path: string, init: ApiRequestInit): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = baseHeaders(method, init.headers);
    const body = encodeBody(init.body, headers);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${apiPath(path, init.query)}`, {
        method,
        headers,
        body,
        signal: init.signal,
        redirect: "manual",
      });
    } catch (cause) {
      throw unavailable(cause, requestId);
    }
    recordSetCookies(session, response.headers.getSetCookie?.() ?? []);
    return response;
  }

  async function send<T>(path: string, init: ApiRequestInit = {}): Promise<ApiResult<T>> {
    const response = await exchange(path, init);
    try {
      return await readEnvelope<T>(
        response,
        path,
        response.headers.get(REQUEST_ID_HEADER) ?? requestId,
      );
    } catch (error) {
      if (isExpiredAccess(error) && !isAuthPath(path) && (await refreshOnce(session))) {
        const retried = await exchange(path, init);
        return readEnvelope<T>(retried, path, retried.headers.get(REQUEST_ID_HEADER) ?? requestId);
      }
      throw error;
    }
  }

  /** 요청당 한 번. 리프레시 쿠키가 없으면 부르지 않는다. */
  function refreshOnce(target: BackendSession): Promise<boolean> {
    if (!hasCookie(target.cookie, REFRESH_TOKEN_COOKIE)) {
      return Promise.resolve(false);
    }
    target.refresh ??= exchange("/auth/refresh", { method: "POST" }).then(
      (response) => response.ok,
      () => false,
    );
    return target.refresh;
  }

  const call =
    (method: string) =>
    async <T>(path: string, init: Omit<ApiRequestInit, "method"> = {}): Promise<T> => {
      if (method !== "GET") {
        forgetChangedBlog(path);
      }
      return (await send<T>(path, { ...init, method })).result;
    };

  /**
   * 블로그 정보를 바꾸는 요청(설정 `PATCH /blogs/{handle}`, 구독 `/me/subscriptions/{handle}`) 뒤에는 기억해 둔 그 블로그 조회를 버린다.
   * 방문 기록(`POST /blogs/{handle}/visits`) 같은 하위 경로는 블로그 정보를 바꾸지 않으므로 그대로 둔다.
   */
  function forgetChangedBlog(path: string) {
    const handle = MEMO_PATH.exec(path)?.[1] ?? SUBSCRIPTION_PATH.exec(path)?.[1];
    if (handle) {
      session.memo.delete(`GET /blogs/${handle}`);
    }
  }

  /**
   * GET. 같은 요청 안에서 여러 loader가 부르는 조회(`/blogs/{handle}`: 공개 블로그 레이아웃과 자식 화면, 004)는
   * `BackendSession.memo`로 한 번만 보낸다.
   */
  function get<T>(path: string, init: Omit<ApiRequestInit, "method"> = {}): Promise<T> {
    if (!isMemoizable(path, init)) {
      return call("GET")<T>(path, init);
    }
    const key = `GET ${path}`;
    let pending = session.memo.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = call("GET")<T>(path, init);
      session.memo.set(key, pending);
    }
    return pending;
  }

  return {
    requestId,
    send,
    get,
    post: call("POST"),
    put: call("PUT"),
    patch: call("PATCH"),
    delete: call("DELETE"),
  };
}
