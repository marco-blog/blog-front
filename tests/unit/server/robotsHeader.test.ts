import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ROBOTS_NOINDEX,
  isManagementPath,
  robotsHeader,
} from "../../../server/middleware/robotsHeader";

/** 006 T009(FR-098): 관리 화면의 모든 응답(200·302·404, 데이터 요청)에 `X-Robots-Tag: noindex, nofollow` */
describe("robotsHeader", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    app.use(robotsHeader());
    app.get("/admin/old", (_req, res) => res.redirect(302, "/admin"));
    app.get("/marco/manage/missing", (_req, res) => res.status(404).end("missing"));
    app.use((_req, res) => res.end("ok"));
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

  const header = async (path: string) =>
    (await fetch(`${base}${path}`, { redirect: "manual" })).headers.get("x-robots-tag");

  it.each(["/admin", "/admin/topics", "/manage", "/marco/manage", "/marco/manage/posts.data"])(
    "%s에는 붙인다",
    async (path) => {
      expect(await header(path)).toBe(ROBOTS_NOINDEX);
    },
  );

  it("리다이렉트·404 응답에도 붙인다", async () => {
    expect(await header("/admin/old")).toBe(ROBOTS_NOINDEX);
    expect(await header("/marco/manage/missing")).toBe(ROBOTS_NOINDEX);
  });

  it.each(["/", "/marco", "/marco/12", "/updates", "/api/v1/posts", "/administrator"])(
    "%s에는 붙이지 않는다",
    async (path) => {
      expect(await header(path)).toBeNull();
    },
  );

  it("경로 판단", () => {
    expect(isManagementPath("/admin.data")).toBe(true);
    expect(isManagementPath("/marco/manage.data")).toBe(true);
    expect(isManagementPath("/marco/12/manage")).toBe(false);
    expect(isManagementPath("/managed")).toBe(false);
  });
});
