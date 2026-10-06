import express from "express";

import { backendUrl } from "./app/config.server.ts";
import { securityHeaders } from "./app/server/securityHeaders.ts";
import { backendProxy } from "./server/middleware/backend-proxy.ts";
import { requestId } from "./server/middleware/request-id.ts";

const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PRODUCTION = process.env.NODE_ENV === "production";
const PORT = Number.parseInt(process.env.PORT || "5173", 10);
const BACKEND_URL = backendUrl();

const app = express();
app.disable("x-powered-by");

app.use(requestId());
// /api/**, /media/** 등은 렌더링하지 않고 backend로 넘긴다(research.md R4).
app.use(backendProxy(BACKEND_URL));
// front가 응답하는 모든 요청에 CSP(요청별 nonce)·nosniff·Referrer-Policy, 운영에서는 HSTS(research.md R27).
app.use(securityHeaders({ production: PRODUCTION }));

if (DEVELOPMENT) {
  const vite = await import("vite");
  const viteDevServer = await vite.createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use(viteDevServer.middlewares);
  app.use(async (req, res, next) => {
    try {
      const source = await viteDevServer.ssrLoadModule("./server/app.ts");
      return await source.app(req, res, next);
    } catch (error) {
      if (error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  app.use("/assets", express.static("build/client/assets", { immutable: true, maxAge: "1y" }));
  app.use(express.static("build/client", { maxAge: "1h" }));
  const build = (await import(BUILD_PATH)) as { app: express.Express };
  app.use(build.app);
}

app.listen(PORT, () => {
  console.log(`front server: http://localhost:${PORT} (backend: ${BACKEND_URL})`);
});
