import { RouterContextProvider } from "react-router";

/** 라우트 모듈의 loader·action을 직접 부를 때 쓰는 인자 */
export function routeArgs<A>(request: Request, params: Record<string, string | undefined> = {}) {
  return { request, params, context: new RouterContextProvider() } as unknown as A;
}

export function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`http://front.test${path}`, { headers });
}

export function formRequest(
  path: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {},
): Request {
  return new Request(`http://front.test${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { origin: "http://front.test", ...headers },
  });
}

/** 던져진 값(리다이렉트 Response, data(…) 오류)을 받는다. */
export async function caught(promise: unknown): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

/** data(...) 결과 */
export interface DataResult<T = unknown> {
  data: T;
  init: ResponseInit | null;
}

export function asData<T = unknown>(value: unknown): DataResult<T> {
  return value as DataResult<T>;
}

export function expectRedirect(value: unknown): string {
  if (!(value instanceof Response) || value.status < 300 || value.status >= 400) {
    throw new Error(`expected a redirect, got ${String(value)}`);
  }
  return value.headers.get("location") ?? "";
}

/** 404 응답을 던졌는지 */
export function statusOf(value: unknown): number | undefined {
  if (value instanceof Response) return value.status;
  return (value as DataResult | undefined)?.init?.status ?? undefined;
}

/** 라우트 스텁에서 loader·action에 로그인 쿠키를 실어 부른다(jsdom 요청에는 쿠키가 없다). */
export function withCookie<A extends { request: Request }, R>(
  fn: (args: A) => R,
  cookie = "access_token=a",
): (args: A) => R {
  return (args) => {
    const headers = new Headers(args.request.headers);
    headers.set("cookie", cookie);
    const init: RequestInit = { method: args.request.method, headers, signal: args.request.signal };
    if (args.request.method !== "GET" && args.request.method !== "HEAD") {
      init.body = args.request.body;
      (init as { duplex?: string }).duplex = "half";
    }
    return fn({ ...args, request: new Request(args.request.url, init) });
  };
}
