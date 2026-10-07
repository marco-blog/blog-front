// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BlogExport } from "~/api/models";
import Backup, {
  BACKUP_REFRESH_MS,
  action,
  exportFileHref,
  formatFileSize,
  hasActiveExport,
  loader,
  meta,
} from "~/routes/manage/backup";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
  withCookie,
} from "../support/route";

/** 백업 화면(T105, 004 FR-145) */
type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type MetaArgs = Parameters<typeof meta>[0];

const ME = "GET /api/v1/me";
const EXPORTS = "GET /api/v1/blogs/marco/exports";
const CREATE = "POST /api/v1/blogs/marco/exports";
const loggedIn = { cookie: "access_token=a" };
const me = {
  userId: 1,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
  unseenReleaseNote: null,
};

function item(id: number, overrides: Partial<BlogExport> = {}): BlogExport {
  return {
    id,
    status: "READY",
    fileSize: 1_572_864,
    errorCode: null,
    createdAt: "2026-10-07T00:00:00Z",
    completedAt: "2026-10-07T00:01:00Z",
    expiresAt: "2026-10-14T00:01:00Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("백업 loader·action", () => {
  it("loader: 최근 백업 목록, 403은 404", async () => {
    const list = [item(3)];
    mockBackend({ [ME]: ok(me), [EXPORTS]: ok(list) });
    const args = () =>
      routeArgs<LoaderArgs>(getRequest("/marco/manage/backup", loggedIn), { handle: "marco" });
    await expect(loader(args())).resolves.toEqual({ handle: "marco", exports: list });

    mockBackend({ [ME]: ok(me), [EXPORTS]: fail(403, "FORBIDDEN") });
    expect(statusOf(await caught(loader(args())))).toBe(404);
  });

  it("action: intent=create는 POST /exports, 409는 오류 코드, 모르는 작업은 400", async () => {
    const call = (fields: Record<string, string>) =>
      action(
        routeArgs<ActionArgs>(formRequest("/marco/manage/backup", fields, loggedIn), {
          handle: "marco",
        }),
      );
    const backend = mockBackend({
      [ME]: ok(me),
      [CREATE]: ok(item(4, { status: "PENDING" }), { status: 202 }),
    });
    expect(asData(await call({ intent: "create" })).data).toEqual({ ok: true });
    expect(backend.callsTo(CREATE)).toHaveLength(1);

    mockBackend({ [ME]: ok(me), [CREATE]: fail(409, "EXPORT_LIMIT_EXCEEDED") });
    const limited = asData<Record<string, unknown>>(await call({ intent: "create" }));
    expect(limited.data).toMatchObject({ ok: false, resultCode: "EXPORT_LIMIT_EXCEEDED" });
    expect(limited.init?.status).toBe(409);

    mockBackend({ [ME]: ok(me), [CREATE]: fail(403, "FORBIDDEN") });
    expect(statusOf(await caught(call({ intent: "create" })))).toBe(404);

    expect(asData(await call({ intent: "delete" })).init?.status).toBe(400);
  });

  it("meta는 noindex", () => {
    expect(
      meta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as unknown as MetaArgs),
    ).toEqual([{ title: "백업 - 블로그" }, { name: "robots", content: "noindex" }]);
  });

  it("도우미: 파일 주소, 만드는 중 판단, 크기 표기", () => {
    expect(exportFileHref("marco", 3)).toBe("/api/v1/blogs/marco/exports/3/file");
    expect(hasActiveExport([item(1), item(2, { status: "RUNNING" })])).toBe(true);
    expect(hasActiveExport([item(1), item(2, { status: "FAILED" })])).toBe(false);
    expect(formatFileSize(1_572_864, "en")).toBe("1.5 MB");
    expect(formatFileSize(512, "en")).toBe("512 byte");
    expect(formatFileSize(null, "en")).toBe("");
  });
});

describe("백업 화면", () => {
  function renderBackup(list: () => BlogExport[], extra: Record<string, Response> = {}) {
    const backend = mockBackend({ [ME]: ok(me), [EXPORTS]: () => ok(list()), ...extra });
    renderRoutes(
      [
        {
          path: ":handle/manage/backup",
          loader: withCookie(loader as never) as never,
          action: withCookie(action as never) as never,
          Component: Backup,
        },
      ],
      { initialEntries: ["/marco/manage/backup"] },
    );
    return backend;
  }

  it("상태별 표시와 READY만 내려받기 링크(크기·만료 시각)", async () => {
    renderBackup(() => [
      item(5),
      item(4, { status: "FAILED", fileSize: null, expiresAt: null, errorCode: "IO_ERROR" }),
      item(3, { status: "EXPIRED", fileSize: null }),
    ]);
    const list = await screen.findByRole("list", { name: "최근 백업" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("완료");
    expect(rows[0]).toHaveTextContent("1.5MB");
    expect(rows[0]).toHaveTextContent("2026년 10월 14일 오전 9:01까지");
    expect(within(rows[0]).getByRole("link", { name: "내려받기" })).toHaveAttribute(
      "href",
      "/api/v1/blogs/marco/exports/5/file",
    );
    expect(rows[1]).toHaveTextContent("실패");
    expect(rows[1]).toHaveTextContent("백업을 만들지 못했습니다.");
    expect(within(rows[1]).queryByRole("link")).toBeNull();
    expect(rows[2]).toHaveTextContent("만료");
    expect(within(rows[2]).queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "백업 만들기" })).toBeEnabled();
  });

  it("빈 목록 안내", async () => {
    renderBackup(() => []);
    expect(await screen.findByText("아직 만든 백업이 없습니다.")).toBeInTheDocument();
  });

  it('"백업 만들기" 뒤 안내, 하루 한 번이 넘으면 문구', async () => {
    renderBackup(() => [], { [CREATE]: fail(409, "EXPORT_LIMIT_EXCEEDED") });
    fireEvent.click(await screen.findByRole("button", { name: "백업 만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "백업은 하루에 한 번만 만들 수 있습니다.",
    );
  });

  it("만드는 중인 백업이 있으면 30초마다 다시 읽는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let status: BlogExport["status"] = "RUNNING";
    const backend = renderBackup(() => [item(6, { status, fileSize: null, expiresAt: null })]);
    expect(await screen.findByText("만드는 중")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "백업 만들기" })).toBeDisabled();
    const before = backend.callsTo(EXPORTS).length;

    status = "READY";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKUP_REFRESH_MS);
    });
    expect(await screen.findByRole("link", { name: "내려받기" })).toBeInTheDocument();
    expect(backend.callsTo(EXPORTS).length).toBeGreaterThan(before);
  });
});
