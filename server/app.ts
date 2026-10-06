import { createRequestHandler } from "@react-router/express";
import express from "express";

import { createLoadContext } from "../app/server/requestContext";
import { cspNonceOf } from "../app/server/securityHeaders";
import { forwardedHeaders } from "./middleware/forwarded";

/** React Router 요청 처리기. 개발 시 Vite가, 운영 시 빌드 산출물(build/server)이 이 모듈을 불러온다. */
export const app = express();
app.disable("x-powered-by");

// SSR이 backend를 부를 때 방문자 주소(X-Forwarded-For)·scheme을 함께 보낸다.
app.use(forwardedHeaders());
app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    // server.ts의 보안 헤더 미들웨어가 정한 nonce를 entry.server로 넘긴다(research.md R27).
    // 개발 모드에서 `npm run dev`가 node --conditions=development로 뜨는 이유: Vite가 불러오는 이 모듈과
    // Node가 바로 불러오는 @react-router/express가 같은 react-router 빌드(RouterContextProvider)를 써야 한다.
    getLoadContext: (_req, res) => createLoadContext(cspNonceOf(res)),
  }),
);
