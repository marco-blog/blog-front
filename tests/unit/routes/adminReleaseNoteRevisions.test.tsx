// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminReleaseNote, AdminRevision } from "~/api/models";
import Revision, {
  loader as revisionLoader,
  meta as revisionMeta,
} from "~/routes/admin/release-note-revision";
import Revisions, {
  loader as revisionsLoader,
  meta as revisionsMeta,
} from "~/routes/admin/release-note-revisions";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

const BASE = "/api/v1/admin/release-notes";
const user = { userId: 1, nickname: "운영자", profileImageUrl: null };
const note = { id: 5, version: "1.4.0", revisionNo: 2 } as AdminReleaseNote;
const summary = (revisionNo: number, status: AdminRevision["status"]): AdminRevision => ({
  revisionNo,
  editedBy: { ...user, nickname: `관리자${revisionNo}` },
  editedAt: "2026-10-07T00:00:00Z",
  status,
  version: null,
  releaseDate: null,
  contents: null,
});
const detail: AdminRevision = {
  ...summary(1, "DRAFT"),
  version: "1.4.0",
  releaseDate: "2026-10-05",
  contents: {
    ko: { title: "처음", contentMarkdown: "## 첫 원문\n<b>그대로</b>" },
    ja: { title: "最初", contentMarkdown: "本文" },
  },
};

/** 수정본 목록·보기(006 T058) */
describe("admin release note revisions", () => {
  it("목록: 번호(→ 보기)·수정한 관리자·시각·당시 상태, 편집 화면으로", async () => {
    mockBackend({
      [ME]: ok(member()),
      [`GET ${BASE}/5`]: ok(note),
      [`GET ${BASE}/5/revisions`]: ok([summary(2, "PUBLISHED"), summary(1, "DRAFT")]),
    });
    renderRoutes(
      [
        {
          path: "admin/release-notes/:id/revisions",
          loader: stub(revisionsLoader),
          Component: Revisions,
        },
      ],
      {
        initialEntries: ["/admin/release-notes/5/revisions"],
      },
    );

    expect(await screen.findByRole("heading", { name: "수정본: 1.4.0" })).toBeInTheDocument();
    const rows = within(screen.getByRole("table", { name: "수정본 목록" })).getAllByRole("row");
    expect(within(rows[1]).getByRole("link", { name: "수정본 2" })).toHaveAttribute(
      "href",
      "/admin/release-notes/5/revisions/2",
    );
    expect(rows[1]).toHaveTextContent("관리자2");
    expect(rows[1]).toHaveTextContent("게시 중");
    expect(rows[2]).toHaveTextContent("초안");
    expect(screen.getByRole("link", { name: "편집 화면으로" })).toHaveAttribute(
      "href",
      "/admin/release-notes/5",
    );
    expect(
      revisionsMeta({ ...(metaArgs() as object), loaderData: { note } } as never),
    ).toContainEqual({
      name: "robots",
      content: "noindex",
    });
  });

  it("목록이 비면 안내, 잘못된 번호·없는 노트는 404", async () => {
    mockBackend({
      [ME]: ok(member()),
      [`GET ${BASE}/5`]: ok(note),
      [`GET ${BASE}/5/revisions`]: ok([]),
    });
    renderRoutes(
      [
        {
          path: "admin/release-notes/:id/revisions",
          loader: stub(revisionsLoader),
          Component: Revisions,
        },
      ],
      {
        initialEntries: ["/admin/release-notes/5/revisions"],
      },
    );
    expect(await screen.findByText("수정본이 없습니다.")).toBeInTheDocument();

    mockBackend({ [ME]: ok(member()), [`GET ${BASE}/9`]: fail(404, "RELEASE_NOTE_NOT_FOUND") });
    const run = (id: string) =>
      revisionsLoader(
        routeArgs(getRequest(`/admin/release-notes/${id}/revisions`, loggedIn), { id }) as never,
      );
    expect(statusOf(await caught(run("x")))).toBe(404);
    expect(statusOf(await caught(run("9")))).toBe(404);
  });

  it("보기: 언어판별 제목·Markdown 원문(읽기 전용), 편집기 채우기 링크", async () => {
    mockBackend({ [ME]: ok(member()), [`GET ${BASE}/5/revisions/1`]: ok(detail) });
    renderRoutes(
      [
        {
          path: "admin/release-notes/:id/revisions/:revisionNo",
          loader: stub(revisionLoader),
          Component: Revision,
        },
      ],
      { initialEntries: ["/admin/release-notes/5/revisions/1"] },
    );

    expect(
      await screen.findByRole("heading", { name: "수정본 1: 1.4.0", level: 1 }),
    ).toBeInTheDocument();
    const ko = screen.getByRole("region", { name: "한국어" });
    expect(within(ko).getByRole("heading", { name: "한국어: 처음" })).toBeInTheDocument();
    expect(ko.querySelector("pre")?.textContent).toBe("## 첫 원문\n<b>그대로</b>");
    expect(screen.getByRole("region", { name: "日本語" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "English" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("link", { name: "이 내용으로 편집기 채우기" })).toHaveAttribute(
      "href",
      "/admin/release-notes/5?fromRevision=1",
    );
    expect(screen.getByRole("link", { name: "수정본 목록으로" })).toHaveAttribute(
      "href",
      "/admin/release-notes/5/revisions",
    );
    expect(
      revisionMeta({ ...(metaArgs() as object), loaderData: { revision: detail } } as never)[0],
    ).toEqual({
      title: "수정본 1: 1.4.0 - 블로그",
    });
  });

  it("보기: 잘못된 번호는 404", async () => {
    mockBackend({ [ME]: ok(member()) });
    const run = (id: string, revisionNo: string) =>
      revisionLoader(
        routeArgs(getRequest(`/admin/release-notes/${id}/revisions/${revisionNo}`, loggedIn), {
          id,
          revisionNo,
        }) as never,
      );
    expect(statusOf(await caught(run("5", "x")))).toBe(404);
    expect(statusOf(await caught(run("x", "1")))).toBe(404);
  });
});
