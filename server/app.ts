import { createRequestHandler } from "@react-router/express";
import express from "express";

/** React Router 요청 처리기. 개발 시 Vite가, 운영 시 빌드 산출물(build/server)이 이 모듈을 불러온다. */
export const app = express();
app.disable("x-powered-by");

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
  }),
);
