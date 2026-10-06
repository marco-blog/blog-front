import type { MiddlewareFunction } from "react-router";

import { readCookie } from "~/i18n/language";

/**
 * 한 요청 동안 front 서버가 backend와 주고받는 쿠키(research.md R2, tasks.md "구현 전 결정 사항" 1번).
 *
 * - backend가 준 `Set-Cookie`(로그인·리프레시·로그아웃·방문자 쿠키 등)를 모아 두었다가
 *   root 미들웨어(`forwardBackendCookies`)가 브라우저 응답에 그대로 싣는다.
 * - 같은 요청 안의 다음 backend 호출에는 새 쿠키 값을 실어 보낸다(리프레시 뒤 재요청).
 * - 리프레시는 요청당 한 번만 한다. 여러 loader가 동시에 401을 받아도 같은 리프레시를 기다린다.
 *
 * 요청 객체를 키로 쓰므로 loader·action에 컨텍스트를 넘기지 않아도 된다.
 * (예외: JS 없는 폼 POST에서 action이 리다이렉트하지 않으면 React Router가 loader에 새 Request를 넘기므로,
 * 그 loader의 Set-Cookie는 action과 따로 모인다. 그 경우에도 브라우저 쿠키는 action 응답으로 갱신된다.)
 */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";

export interface BackendSession {
  /** backend로 보낼 Cookie 헤더(들어온 값 + 이 요청에서 받은 Set-Cookie) */
  cookie: string | null;
  /** 브라우저 응답에 실을 Set-Cookie */
  setCookies: string[];
  /** 이 요청의 리프레시(한 번만) */
  refresh: Promise<boolean> | null;
  /** 같은 요청 안에서 여러 번 부르는 조회(예: /me)를 한 번으로 줄인다. */
  memo: Map<string, Promise<unknown>>;
}

const sessions = new WeakMap<Request, BackendSession>();

export function backendSession(request: Request): BackendSession {
  let session = sessions.get(request);
  if (!session) {
    session = {
      cookie: request.headers.get("cookie"),
      setCookies: [],
      refresh: null,
      memo: new Map(),
    };
    sessions.set(request, session);
  }
  return session;
}

/** backend 응답의 Set-Cookie를 모으고, 다음 호출의 Cookie 헤더에 반영한다. */
export function recordSetCookies(session: BackendSession, setCookies: readonly string[]): void {
  const fresh = setCookies.filter((cookie) => !session.setCookies.includes(cookie));
  if (fresh.length === 0) {
    return;
  }
  session.setCookies.push(...fresh);
  session.cookie = mergeCookieHeader(session.cookie, fresh);
}

/** front가 직접 정하는 쿠키(last_blog 등)도 같은 경로로 브라우저에 보낸다. */
export function addResponseCookie(request: Request, setCookie: string): void {
  recordSetCookies(backendSession(request), [setCookie]);
}

/** 이 요청에서 브라우저로 보낼 Set-Cookie 목록 */
export function responseCookies(request: Request): string[] {
  return [...(sessions.get(request)?.setCookies ?? [])];
}

export function hasCookie(header: string | null | undefined, name: string): boolean {
  return Boolean(readCookie(header, name));
}

function isExpired(attributes: string[]): boolean {
  for (const attribute of attributes) {
    const [rawName, ...rest] = attribute.split("=");
    const name = rawName.trim().toLowerCase();
    const value = rest.join("=").trim();
    if (name === "max-age" && Number(value) <= 0) {
      return true;
    }
    if (name === "expires") {
      const time = Date.parse(value);
      if (!Number.isNaN(time) && time <= Date.now()) {
        return true;
      }
    }
  }
  return false;
}

/** Cookie 헤더에 Set-Cookie 값을 덮어쓴다. 만료(Max-Age=0 등)된 쿠키는 뺀다. */
export function mergeCookieHeader(
  header: string | null,
  setCookies: readonly string[],
): string | null {
  const jar = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      jar.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
    }
  }
  for (const setCookie of setCookies) {
    const [pair, ...attributes] = setCookie.split(";");
    const separator = pair.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    if (isExpired(attributes)) {
      jar.delete(name);
    } else {
      jar.set(name, pair.slice(separator + 1).trim());
    }
  }
  if (jar.size === 0) {
    return null;
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/** 응답에 Set-Cookie를 더한다. 헤더를 바꿀 수 없는 응답이면 복사해서 더한다. */
export function withSetCookies(response: Response, setCookies: readonly string[]): Response {
  if (setCookies.length === 0) {
    return response;
  }
  try {
    for (const cookie of setCookies) {
      response.headers.append("Set-Cookie", cookie);
    }
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const cookie of setCookies) {
      headers.append("Set-Cookie", cookie);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

/** root 미들웨어: 이 요청에서 모은 Set-Cookie를 문서·데이터·리다이렉트 응답 모두에 싣는다. */
export const forwardBackendCookies: MiddlewareFunction<Response> = async ({ request }, next) => {
  const session = backendSession(request);
  const response = await next();
  return withSetCookies(response, session.setCookies);
};
