import type { NextFunction, Request, Response } from "express";

const FORWARDED_FOR = "x-forwarded-for";
const FORWARDED_PROTO = "x-forwarded-proto";
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** Node가 IPv6 소켓에서 주는 `::ffff:127.0.0.1` 같은 주소를 IPv4 표기로 바꾼다. */
export function normalizeAddress(address: string | undefined): string | null {
  if (!address) {
    return null;
  }
  return IPV4_MAPPED.exec(address)?.[1] ?? address;
}

/**
 * SSR loader·action이 backend를 부를 때 방문자 주소를 알 수 있게 들어온 요청 헤더를 고친다.
 * `app/api/client.server.ts`가 이 두 헤더를 backend로 그대로 보낸다.
 *
 * - `X-Forwarded-For`: 앞단(nginx 등)이 보낸 값 끝에 이 서버의 접속 주소를 붙인다. 방문자가 값을 꾸며 보내도
 *   실제 접속 주소가 맨 뒤에 오므로, backend는 오른쪽부터 믿는 프록시(blog.security.trusted-proxies)를 건너뛰어
 *   방문자 주소를 찾는다.
 * - `X-Forwarded-Proto`: 앞단이 TLS를 끝낸 경우 그 값을 그대로 두고, 없으면 이 서버의 접속 scheme을 넣는다.
 *
 * `/api/**` 프록시는 http-proxy-middleware의 `xfwd`가 같은 일을 하므로 이 미들웨어는 React Router 요청에만 쓴다.
 */
export function forwardedHeaders() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const prior = joined(req.headers[FORWARDED_FOR]);
    const peer = normalizeAddress(req.socket.remoteAddress);
    const chain = [prior, peer].filter((value): value is string => Boolean(value));
    if (chain.length > 0) {
      req.headers[FORWARDED_FOR] = chain.join(", ");
    }
    if (!joined(req.headers[FORWARDED_PROTO])) {
      req.headers[FORWARDED_PROTO] =
        "encrypted" in req.socket && req.socket.encrypted ? "https" : "http";
    }
    next();
  };
}

function joined(value: string | string[] | undefined): string | null {
  const text = (Array.isArray(value) ? value.join(", ") : value)?.trim();
  return text ? text : null;
}
