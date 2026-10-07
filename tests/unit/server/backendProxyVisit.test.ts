import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backendProxy, isVisitPath, wantsHtml } from "../../../server/middleware/backend-proxy";
import { requestId } from "../../../server/middleware/request-id";

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

const NOT_FOUND_JSON = JSON.stringify({
  header: { isSuccessful: false, resultCode: "EXTERNAL_POST_NOT_FOUND", resultMessage: "" },
  result: null,
});

/** 외부 글 이동 경로의 프록시 규칙(007 T051, contracts/routes.md) */
describe("backendProxy — /api/v1/external-posts/{id}/visit", () => {
  const forwardedFor: (string | undefined)[] = [];
  let backend: Server;
  let front: Server;
  let frontUrl: string;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      forwardedFor.push(req.headers["x-forwarded-for"] as string | undefined);
      if (req.url === "/api/v1/external-posts/1/visit") {
        res.writeHead(302, {
          location: "https://remote.example/post/1",
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        });
        res.end();
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(NOT_FOUND_JSON);
    });
    const backendUrl = await listen(backend);

    const app = express();
    app.use(requestId());
    app.use(backendProxy(backendUrl));
    // React Router 자리: 프록시가 넘긴 요청은 404 화면을 그린다.
    app.use((_req, res) => {
      res.status(404).type("html").send("<!doctype html><h1>페이지를 찾을 수 없습니다</h1>");
    });
    front = createServer(app);
    frontUrl = await listen(front);
  });

  afterAll(async () => {
    await Promise.all([close(front), close(backend)]);
  });

  it("302는 그대로(Location·헤더 유지, 방문자 주소 전달)", async () => {
    forwardedFor.length = 0;
    const response = await fetch(`${frontUrl}/api/v1/external-posts/1/visit`, {
      redirect: "manual",
      headers: { accept: "text/html" },
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://remote.example/post/1");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f]{16}$/);
    expect(forwardedFor[0]).toBeDefined();
  });

  it("404이고 Accept: text/html이면 front의 404 화면", async () => {
    const response = await fetch(`${frontUrl}/api/v1/external-posts/9/visit`, {
      headers: { accept: "text/html,application/xhtml+xml" },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("페이지를 찾을 수 없습니다");
    expect(body).not.toContain("EXTERNAL_POST_NOT_FOUND");
  });

  it("JSON 요청의 404는 JSON 그대로", async () => {
    const response = await fetch(`${frontUrl}/api/v1/external-posts/9/visit`, {
      headers: { accept: "application/json" },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      header: { resultCode: "EXTERNAL_POST_NOT_FOUND" },
    });
  });

  it("다른 API의 404는 HTML 요청이어도 JSON 그대로(이 경로 한 곳만)", async () => {
    const response = await fetch(`${frontUrl}/api/v1/external-posts/9`, {
      headers: { accept: "text/html" },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  it("경로·요청 판별", () => {
    expect(isVisitPath("GET", "/api/v1/external-posts/1/visit")).toBe(true);
    expect(isVisitPath("head", "/api/v1/external-posts/abc/visit")).toBe(true);
    expect(isVisitPath("POST", "/api/v1/external-posts/1/visit")).toBe(false);
    expect(isVisitPath("GET", "/api/v1/external-posts/1/visit/x")).toBe(false);
    expect(isVisitPath("GET", "/api/v1/external-posts/1")).toBe(false);
    expect(wantsHtml({ headers: { accept: "text/html" } } as never)).toBe(true);
    expect(wantsHtml({ headers: {} } as never)).toBe(false);
  });
});

describe("backendProxy — visit 연결 실패", () => {
  let front: Server;
  let frontUrl: string;

  beforeAll(async () => {
    const unused = createServer();
    const deadUrl = await listen(unused);
    await close(unused);
    const app = express();
    app.use(backendProxy(deadUrl));
    front = createServer(app);
    frontUrl = await listen(front);
  });

  afterAll(async () => {
    await close(front);
  });

  it("backend에 닿지 못하면 502 공통 응답", async () => {
    const response = await fetch(`${frontUrl}/api/v1/external-posts/1/visit`);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      header: { resultCode: "BACKEND_UNAVAILABLE" },
    });
  });
});
