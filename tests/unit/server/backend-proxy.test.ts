import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backendProxy, isBackendPath } from "../../../server/middleware/backend-proxy";
import { requestId } from "../../../server/middleware/request-id";

describe("isBackendPath", () => {
  it.each([
    ["GET", "/api"],
    ["GET", "/api/v1/me"],
    ["POST", "/api/v1/posts"],
    ["DELETE", "/api/v1/posts/1"],
    ["GET", "/media/abc"],
    ["GET", "/media/abc/200x200"],
    ["GET", "/marco/rss"],
    ["HEAD", "/marco/atom"],
    ["GET", "/marco/category/12/rss"],
    ["POST", "/marco/123/trackback"],
    ["GET", "/sitemap.xml"],
    ["GET", "/sitemap/posts-1.xml"],
    ["GET", "/robots.txt"],
  ])("%s %s → backend", (method, path) => {
    expect(isBackendPath(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/"],
    ["GET", "/apiary"],
    ["GET", "/mediax"],
    ["GET", "/marco"],
    ["GET", "/marco/123"],
    ["POST", "/marco/rss"],
    ["GET", "/marco/123/trackback"],
    ["GET", "/marco/category/abc/rss"],
    ["GET", "/a/b/rss"],
    ["GET", "/sitemap"],
  ])("%s %s → front", (method, path) => {
    expect(isBackendPath(method, path)).toBe(false);
  });
});

describe("isBackendPath — 002 피드·사이트맵(contracts/routes.md 프록시)", () => {
  const backendPaths = [
    "/marco/rss",
    "/marco/atom",
    "/marco/category/12/rss",
    "/sitemap.xml",
    "/sitemap/posts-1.xml",
    "/robots.txt",
  ];

  it.each(
    backendPaths.flatMap((path) => [
      ["GET", path],
      ["HEAD", path],
    ]),
  )("%s %s → backend", (method, path) => {
    expect(isBackendPath(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/marco/rss/x"],
    ["GET", "/marco/category/x/rss"],
    ["POST", "/marco/rss"],
    ["GET", "/search"],
    ["GET", "/feed"],
    ["GET", "/notifications"],
    ["POST", "/notifications"],
  ])("%s %s → front", (method, path) => {
    expect(isBackendPath(method, path)).toBe(false);
  });
});

interface Received {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

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

describe("backendProxy", () => {
  const received: Received[] = [];
  let backend: Server;
  let front: Server;
  let frontUrl: string;
  let backendUrl: string;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        received.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.writeHead(201, {
          "content-type": "application/json",
          "set-cookie": "access_token=t; HttpOnly; Path=/",
        });
        res.end(
          JSON.stringify({
            header: { isSuccessful: true, resultCode: "OK", resultMessage: "" },
            result: 1,
          }),
        );
      });
    });
    backendUrl = await listen(backend);

    const app = express();
    app.use(requestId());
    app.use(backendProxy(backendUrl));
    app.use((_req, res) => {
      res.status(200).send("front");
    });
    front = createServer(app);
    frontUrl = await listen(front);
  });

  afterAll(async () => {
    await Promise.all([close(front), close(backend)]);
  });

  it("/api 요청을 경로·메서드·본문·쿠키 그대로 backend로 넘기고 응답을 돌려준다", async () => {
    received.length = 0;
    const response = await fetch(`${frontUrl}/api/v1/posts?x=1`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "access_token=abc",
        origin: "http://localhost:5173",
        "x-request-id": "abcdef1234567890",
      },
      body: JSON.stringify({ title: "t" }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("access_token=t");
    expect(response.headers.get("x-request-id")).toBe("abcdef1234567890");
    expect(await response.json()).toMatchObject({ result: 1 });
    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request.method).toBe("POST");
    expect(request.url).toBe("/api/v1/posts?x=1");
    expect(request.body).toBe(JSON.stringify({ title: "t" }));
    expect(request.headers.cookie).toBe("access_token=abc");
    // backend의 Origin 검사(R3)를 위해 브라우저 Origin을 바꾸지 않고 넘긴다.
    expect(request.headers.origin).toBe("http://localhost:5173");
    expect(request.headers["x-request-id"]).toBe("abcdef1234567890");
    expect(request.headers["x-forwarded-for"]).toBeDefined();
    expect(request.headers.host).toBe(new URL(backendUrl).host);
  });

  it("X-Request-Id가 없으면 만들어 backend와 응답에 같이 싣는다", async () => {
    received.length = 0;
    const response = await fetch(`${frontUrl}/media/abc`);

    const id = response.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(received[0].headers["x-request-id"]).toBe(id);
  });

  it("프록시 대상이 아닌 경로는 front가 처리한다", async () => {
    received.length = 0;
    const response = await fetch(`${frontUrl}/marco`);

    expect(await response.text()).toBe("front");
    expect(received).toHaveLength(0);
  });
});

describe("backendProxy 연결 실패", () => {
  let front: Server;
  let frontUrl: string;

  beforeAll(async () => {
    const unused = createServer();
    const deadUrl = await listen(unused);
    await close(unused);

    const app = express();
    app.use(requestId());
    app.use(backendProxy(deadUrl));
    front = createServer(app);
    frontUrl = await listen(front);
  });

  afterAll(() => close(front));

  it("/api는 공통 응답 틀의 502 BACKEND_UNAVAILABLE", async () => {
    const response = await fetch(`${frontUrl}/api/v1/me`, {
      headers: { "x-request-id": "abcdef1234567890" },
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      header: {
        isSuccessful: false,
        resultCode: "BACKEND_UNAVAILABLE",
        resultMessage: "Backend unavailable",
        traceId: "abcdef1234567890",
      },
      result: null,
    });
  });

  it("그 밖의 경로는 502 텍스트", async () => {
    const response = await fetch(`${frontUrl}/media/abc`);

    expect(response.status).toBe(502);
    expect(await response.text()).toBe("Bad Gateway");
  });
});
