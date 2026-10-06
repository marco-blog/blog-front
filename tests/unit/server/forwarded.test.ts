import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { forwardedHeaders, normalizeAddress } from "../../../server/middleware/forwarded";

/**
 * SSR이 backend를 부를 때 방문자 주소를 알 수 있도록, front 서버가 들어온 요청의 X-Forwarded-For 끝에
 * 접속 주소를 붙이고 X-Forwarded-Proto가 없으면 접속 scheme을 넣는다(backend는 front가 보낸 것만 믿는다).
 */
describe("forwardedHeaders", () => {
  let server: Server;
  let base: string;
  let received: IncomingHttpHeaders;

  beforeAll(async () => {
    const app = express();
    app.use(forwardedHeaders());
    app.use((req, res) => {
      received = req.headers;
      res.end("ok");
    });
    server = createServer(app);
    base = await new Promise<string>((resolve) => {
      server.listen(0, "127.0.0.1", () =>
        resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
      );
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("헤더가 없으면 접속 주소와 http", async () => {
    await fetch(`${base}/marco`);

    expect(received["x-forwarded-for"]).toBe("127.0.0.1");
    expect(received["x-forwarded-proto"]).toBe("http");
  });

  it("앞단이 보낸 X-Forwarded-For 끝에 접속 주소를 붙이고, X-Forwarded-Proto는 그대로 둔다", async () => {
    await fetch(`${base}/marco`, {
      headers: { "x-forwarded-for": "203.0.113.7", "x-forwarded-proto": "https" },
    });

    expect(received["x-forwarded-for"]).toBe("203.0.113.7, 127.0.0.1");
    expect(received["x-forwarded-proto"]).toBe("https");
  });

  it("방문자가 꾸민 값이 있어도 실제 접속 주소가 맨 뒤에 온다", async () => {
    await fetch(`${base}/marco`, { headers: { "x-forwarded-for": "1.1.1.1,  2.2.2.2" } });

    expect(received["x-forwarded-for"]).toBe("1.1.1.1,  2.2.2.2, 127.0.0.1");
  });
});

describe("normalizeAddress", () => {
  it("IPv4에 대응하는 IPv6 표기는 IPv4로", () => {
    expect(normalizeAddress("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(normalizeAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("그 밖의 주소는 그대로, 없으면 null", () => {
    expect(normalizeAddress("::1")).toBe("::1");
    expect(normalizeAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(normalizeAddress("10.0.0.1")).toBe("10.0.0.1");
    expect(normalizeAddress(undefined)).toBeNull();
    expect(normalizeAddress("")).toBeNull();
  });
});
