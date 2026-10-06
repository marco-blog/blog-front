import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { securityHeaders } from "~/server/securityHeaders";

import { backendProxy } from "../../../server/middleware/backend-proxy";
import { requestId } from "../../../server/middleware/request-id";

/**
 * 이미지 프록시(T210, research.md R4): `/media/**`는 바이너리와 캐시 헤더를 그대로 넘기고,
 * `/api/v1/media` 업로드 본문은 front가 읽거나 크기를 제한하지 않고 backend로 흘려보낸다.
 * server.ts와 같은 순서(request-id → backend 프록시 → 보안 헤더)로 미들웨어를 붙인다.
 */
const KEY = "k3Jd9fQ2xLmA7pZ0bR5tYw";
/** 바이트 값이 0~255를 모두 지나는 가짜 이미지(문자열로 바뀌면 깨진다) */
const IMAGE = Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 256));
const UPLOAD_BYTES = 10 * 1024 * 1024;

interface Upload {
  headers: IncomingHttpHeaders;
  bytes: number;
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

describe("/media 프록시", () => {
  const uploads: Upload[] = [];
  let backend: Server;
  let front: Server;
  let frontUrl: string;

  beforeAll(async () => {
    backend = createServer((req, res) => {
      if (req.method === "GET" && req.url?.startsWith(`/media/${KEY}`)) {
        res.writeHead(200, {
          "content-type": "image/png",
          "content-length": IMAGE.length,
          "cache-control": req.url.endsWith("/temp")
            ? "private, no-store"
            : "public, max-age=31536000, immutable",
          "content-disposition": "inline",
          "x-content-type-options": "nosniff",
        });
        res.end(IMAGE);
        return;
      }
      if (req.method === "POST" && req.url === "/api/v1/media") {
        let bytes = 0;
        req.on("data", (chunk: Buffer) => (bytes += chunk.length));
        req.on("end", () => {
          uploads.push({ headers: req.headers, bytes });
          res.writeHead(201, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              header: { isSuccessful: true, resultCode: "OK", resultMessage: "" },
              result: { key: KEY, url: `/media/${KEY}` },
            }),
          );
        });
        return;
      }
      res.writeHead(404).end();
    });
    const backendUrl = await listen(backend);

    const app = express();
    app.use(requestId());
    app.use(backendProxy(backendUrl));
    app.use(securityHeaders({ production: false }));
    app.use((_req, res) => {
      res.status(200).send("front");
    });
    front = createServer(app);
    frontUrl = await listen(front);
  });

  afterAll(async () => {
    await Promise.all([close(front), close(backend)]);
  });

  it("원본·썸네일 바이너리와 Content-Type·Cache-Control·nosniff·inline을 그대로 넘긴다", async () => {
    for (const path of [`/media/${KEY}`, `/media/${KEY}/300x200?fit=contain`]) {
      const response = await fetch(`${frontUrl}${path}`);

      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(IMAGE)).toBe(true);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-length")).toBe(String(IMAGE.length));
      expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(response.headers.get("content-disposition")).toBe("inline");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      // front 화면용 CSP는 붙이지 않는다(backend 응답 그대로).
      expect(response.headers.get("content-security-policy")).toBeNull();
    }
  });

  it("TEMP 이미지의 private, no-store도 바꾸지 않는다", async () => {
    const response = await fetch(`${frontUrl}/media/${KEY}/temp`);

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("10MB 업로드 본문을 크기 제한 없이 그대로 backend로 보낸다(multipart 경계·쿠키·Origin 유지)", async () => {
    uploads.length = 0;
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(UPLOAD_BYTES)], { type: "image/jpeg" }),
      "big.jpg",
    );
    form.append("purpose", "POST");
    const request = new Request(`${frontUrl}/api/v1/media`, {
      method: "POST",
      body: form,
      headers: { cookie: "access_token=a", origin: "http://localhost:5173" },
    });
    const sent = Buffer.from(await request.clone().arrayBuffer()).length;

    const response = await fetch(request);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ result: { key: KEY } });
    expect(uploads).toHaveLength(1);
    expect(uploads[0].bytes).toBe(sent);
    expect(uploads[0].bytes).toBeGreaterThan(UPLOAD_BYTES);
    expect(uploads[0].headers["content-type"]).toBe(request.headers.get("content-type"));
    expect(uploads[0].headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(uploads[0].headers.cookie).toBe("access_token=a");
    expect(uploads[0].headers.origin).toBe("http://localhost:5173");
  });
});
