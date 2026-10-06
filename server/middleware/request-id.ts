import type { NextFunction, Request, Response } from "express";

import { REQUEST_ID_HEADER, resolveRequestId } from "../../app/api/request-id.server.ts";

/**
 * 요청마다 X-Request-Id를 정해 요청 헤더(프록시·SSR loader가 backend로 전달)와 응답 헤더에 싣는다.
 * 브라우저나 앞단 프록시가 보낸 값이 형식에 맞으면 이어 쓴다.
 */
export function requestId() {
  const headerName = REQUEST_ID_HEADER.toLowerCase();
  return (req: Request, res: Response, next: NextFunction) => {
    const id = resolveRequestId(req.headers[headerName]);
    req.headers[headerName] = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  };
}
