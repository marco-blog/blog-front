// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ServiceSettings } from "~/api/models";
import Reserved, {
  loader as reservedLoader,
  meta as reservedMeta,
} from "~/routes/admin/reserved-handles";
import Settings, {
  loader as settingsLoader,
  meta as settingsMeta,
} from "~/routes/admin/service-settings";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

const RESERVED = "GET /api/v1/admin/reserved-handles";
const SETTINGS = "GET /api/v1/admin/service-settings";

const settings = (overrides: Partial<ServiceSettings["admin"]> = {}): ServiceSettings => ({
  termsVersion: "2026-10-06",
  blogs: { defaultMaxPerMember: 3 },
  media: {
    maxFileSize: 10 * 1024 * 1024,
    maxPixels: 40_000_000,
    tempQuota: 200 * 1024 * 1024,
    tempTtl: "PT24H",
    allowedTypes: ["image/jpeg", "image/png"],
  },
  admin: { auditRetention: "PT8760H", dashboardCacheTtl: "PT5M", ...overrides },
});

/** 예약어·서비스 설정(006 T028) */
describe("admin reserved handles", () => {
  it("목록과 안내, 입력·저장 버튼 없음", async () => {
    mockBackend({ [ME]: ok(member()), [RESERVED]: ok(["about", "admin", "api"]) });
    renderRoutes(
      [{ path: "admin/reserved-handles", loader: stub(reservedLoader), Component: Reserved }],
      {
        initialEntries: ["/admin/reserved-handles"],
      },
    );

    const list = await screen.findByRole("list", { name: "예약어 목록" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["about", "admin", "api"]);
    expect(screen.getByText("모두 3개")).toBeInTheDocument();
    expect(screen.getByText(/코드 상수로 관리합니다/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(reservedMeta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("관리자가 아니면 404", async () => {
    mockBackend({ [ME]: ok(member()), [RESERVED]: fail(404, "NOT_FOUND") });
    const error = await caught(
      reservedLoader(routeArgs(getRequest("/admin/reserved-handles", loggedIn))),
    );
    expect(statusOf(error)).toBe(404);
  });
});

describe("admin service settings", () => {
  it("사람이 읽는 값과 프로퍼티 이름, 입력·저장 버튼 없음", async () => {
    mockBackend({ [ME]: ok(member()), [SETTINGS]: ok(settings()) });
    renderRoutes([{ path: "admin/settings", loader: stub(settingsLoader), Component: Settings }], {
      initialEntries: ["/admin/settings"],
    });

    const table = await screen.findByRole("table", { name: "서비스 설정 값" });
    const rows = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent));
    expect(rows).toEqual([
      ["약관 버전", "2026-10-06", "blog.legal.terms-version"],
      ["회원당 기본 블로그 수", "3", "blog.blogs.default-max-per-member"],
      ["첨부 파일 최대 크기", "10 MB", "blog.media.max-size"],
      ["이미지 최대 픽셀 수", "40,000,000", "blog.media.max-pixels"],
      ["임시 첨부 한도(회원당)", "200 MB", "blog.media.temp-quota"],
      ["임시 첨부 보관 기간", "1일", "blog.media.temp-ttl"],
      ["허용 파일 형식", "image/jpeg, image/png", "blog.media.allowed-types"],
      ["작업 기록 보관 기간", "365일", "blog.admin.audit-retention"],
      ["대시보드 갱신 주기", "5분", "blog.admin.dashboard-cache-ttl"],
    ]);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(settingsMeta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("대시보드 캐시 0이면 끔", async () => {
    mockBackend({ [ME]: ok(member()), [SETTINGS]: ok(settings({ dashboardCacheTtl: "PT0S" })) });
    renderRoutes([{ path: "admin/settings", loader: stub(settingsLoader), Component: Settings }], {
      initialEntries: ["/admin/settings"],
    });
    expect(await screen.findByText("끔(요청마다 계산)")).toBeInTheDocument();
  });

  it("관리자가 아니면 404", async () => {
    mockBackend({ [ME]: ok(member("USER")) });
    const error = await caught(settingsLoader(routeArgs(getRequest("/admin/settings", loggedIn))));
    expect(statusOf(error)).toBe(404);
  });
});
