// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminReleaseNoteSummary } from "~/api/models";
import ReleaseNotes, { loader, meta, releaseNotesHref } from "~/routes/admin/release-notes";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

const LIST = "GET /api/v1/admin/release-notes";

const summary = (
  id: number,
  overrides: Partial<AdminReleaseNoteSummary> = {},
): AdminReleaseNoteSummary => ({
  id,
  version: `1.${id}.0`,
  status: "DRAFT",
  releaseDate: "2026-10-07",
  langs: ["ko", "en"],
  revisionNo: 2,
  firstPublishedAt: null,
  publishedAt: null,
  updatedAt: "2026-10-07T00:00:00Z",
  ...overrides,
});

const call = (path: string) => loader(routeArgs(getRequest(path, loggedIn)) as never);

/** 릴리스 노트 목록(006 T056) */
describe("admin release notes", () => {
  it("상태 탭 → GET /admin/release-notes?status=&page=(0부터), 모르는 상태는 전체", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [LIST]: ok([summary(1)], { totalCount: 21 }),
    });

    await expect(call("/admin/release-notes?status=PUBLISHED&page=2")).resolves.toMatchObject({
      status: "PUBLISHED",
      page: 2,
      totalCount: 21,
    });
    expect(Object.fromEntries(backend.callsTo(LIST)[0].url.searchParams)).toEqual({
      status: "PUBLISHED",
      page: "1",
      size: "20",
    });
    await expect(call("/admin/release-notes?status=GONE")).resolves.toMatchObject({ status: null });
    expect(Object.fromEntries(backend.callsTo(LIST)[1].url.searchParams)).toEqual({
      page: "0",
      size: "20",
    });
    expect(releaseNotesHref("DRAFT", 3)).toBe("/admin/release-notes?status=DRAFT&page=3");
    expect(releaseNotesHref(null)).toBe("/admin/release-notes");
  });

  it("관리자가 아니면 404, meta noindex", async () => {
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call("/admin/release-notes")))).toBe(404);
    mockBackend({ [ME]: ok(member()), [LIST]: fail(404, "NOT_FOUND") });
    expect(statusOf(await caught(call("/admin/release-notes")))).toBe(404);
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("화면: 탭(현재 탭 표시), 새 노트, 표(버전 → 편집·상태 배지·날짜·언어판·수정본·게시 시각)", async () => {
    mockBackend({
      [ME]: ok(member()),
      [LIST]: ok(
        [
          summary(1),
          summary(2, {
            status: "PUBLISHED",
            langs: ["ko"],
            revisionNo: 5,
            publishedAt: "2026-10-07T03:00:00Z",
            firstPublishedAt: "2026-10-06T03:00:00Z",
          }),
        ],
        { totalCount: 2 },
      ),
    });
    renderRoutes([{ path: "admin/release-notes", loader: stub(loader), Component: ReleaseNotes }], {
      initialEntries: ["/admin/release-notes?status=DRAFT"],
    });

    const tabs = await screen.findByRole("navigation", { name: "상태" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["전체", "/admin/release-notes"],
      ["초안", "/admin/release-notes?status=DRAFT"],
      ["게시", "/admin/release-notes?status=PUBLISHED"],
    ]);
    expect(within(tabs).getByRole("link", { name: "초안" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(tabs).getByRole("link", { name: "전체" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "새 노트" })).toHaveAttribute(
      "href",
      "/admin/release-notes/new",
    );
    const rows = within(screen.getByRole("table", { name: "릴리스 노트 목록" })).getAllByRole(
      "row",
    );
    expect(within(rows[1]).getByRole("link", { name: "1.1.0" })).toHaveAttribute(
      "href",
      "/admin/release-notes/1",
    );
    expect(rows[1]).toHaveTextContent("초안");
    expect(rows[1]).toHaveTextContent("ko, en");
    expect(rows[1]).toHaveTextContent("게시 전");
    expect(rows[2]).toHaveTextContent("게시 중");
    expect(rows[2]).toHaveTextContent("5");
    expect(rows[2].querySelector(".badge-published")).not.toBeNull();
  });

  it("빈 목록 안내", async () => {
    mockBackend({ [ME]: ok(member()), [LIST]: ok([], { totalCount: 0 }) });
    renderRoutes([{ path: "admin/release-notes", loader: stub(loader), Component: ReleaseNotes }], {
      initialEntries: ["/admin/release-notes"],
    });
    expect(await screen.findByText("릴리스 노트가 없습니다.")).toBeInTheDocument();
  });
});
