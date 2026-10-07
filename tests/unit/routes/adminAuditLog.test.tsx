// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminMember, AuditLogEntry } from "~/api/models";
import { auditTargetHref } from "~/components/admin/AuditLogTable";
import AuditLog, { loader, meta } from "~/routes/admin/audit-log";
import AuditEntry, {
  loader as entryLoader,
  meta as entryMeta,
} from "~/routes/admin/audit-log-entry";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
const LOGS = "GET /api/v1/admin/audit-logs";
const ACTIONS = "GET /api/v1/admin/audit-logs/actions";
const ADMINS = "GET /api/v1/admin/admins";

const admins: AdminMember[] = [
  {
    userId: 1,
    nickname: "운영자",
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    userId: 2,
    nickname: "도우미",
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: "2026-02-01T00:00:00Z",
  },
];
const choices = {
  actions: [
    "TOPIC_HIDE",
    "ROLE_GRANT",
    "ROLE_REVOKE",
    "USER_BLOG_LIMIT_CHANGE",
    "EXTERNAL_BLOG_BLOCK",
  ],
  targetTypes: ["USER", "TOPIC", "RELEASE_NOTE"],
};
const entry = (id: number, overrides: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id,
  admin: { userId: 1, nickname: "운영자" },
  action: "ROLE_GRANT",
  targetType: "USER",
  targetId: 12,
  targetKey: null,
  before: { role: "USER" },
  after: { role: "ADMIN" },
  reason: null,
  createdAt: "2026-10-07T01:00:00Z",
  ...overrides,
});

function backend(logs: Response = ok([entry(1)], { totalCount: 1 })) {
  return mockBackend({
    [ME]: ok(member()),
    [ACTIONS]: ok(choices),
    [ADMINS]: ok(admins),
    [LOGS]: logs,
  });
}

const call = (path: string) => loader(routeArgs<LoaderArgs>(getRequest(path, loggedIn)));

/** 작업 기록(006 T047) */
describe("admin audit log loader", () => {
  it("조건을 backend 쿼리로(묶음은 backend가 아는 코드만), 선택지는 actions·admins API", async () => {
    const api = backend();

    await expect(
      call(
        "/admin/audit-log?from=2026-10-01&to=2026-10-07&adminId=2&action=group:role&targetType=USER&targetId=12&page=2",
      ),
    ).resolves.toMatchObject({ entries: [entry(1)], totalCount: 1, admins, choices });
    expect(Object.fromEntries(api.callsTo(LOGS)[0].url.searchParams)).toEqual({
      from: "2026-10-01",
      to: "2026-10-07",
      adminId: "2",
      action: "ROLE_GRANT,ROLE_REVOKE",
      targetType: "USER",
      targetId: "12",
      page: "1",
      size: "20",
    });
  });

  it("400 기간 오류는 폼 문구, 관리자 아님은 404", async () => {
    backend(
      fail(400, "VALIDATION_FAILED", [{ field: "to", code: "INVALID", params: { max: 366 } }]),
    );
    await expect(call("/admin/audit-log?from=2024-01-01&to=2026-01-01")).resolves.toMatchObject({
      entries: null,
      fieldErrors: [{ field: "to", code: "INVALID" }],
    });

    mockBackend({ [ME]: ok(member()), [ACTIONS]: fail(404, "NOT_FOUND"), [ADMINS]: ok(admins) });
    expect(statusOf(await caught(call("/admin/audit-log")))).toBe(404);
    mockBackend({
      [ME]: ok(member()),
      [ACTIONS]: ok(choices),
      [ADMINS]: ok(admins),
      [LOGS]: fail(500, "INTERNAL_ERROR"),
    });
    expect(statusOf(await caught(call("/admin/audit-log")))).toBe(500);
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });
});

describe("admin audit log 화면", () => {
  function renderLog(entry: string, logs?: Response) {
    backend(logs);
    renderRoutes([{ path: "admin/audit-log", loader: stub(loader), Component: AuditLog }], {
      initialEntries: [entry],
    });
  }

  it("필터 폼: 관리자 선택지, 작업 종류 묶음(backend가 아는 코드만, 모르는 코드는 끝에 코드 그대로), 값 유지", async () => {
    renderLog("/admin/audit-log?adminId=2&action=group:role&targetType=USER");

    const form = await screen.findByRole("search", { name: "거르기" });
    const admin = within(form).getByRole("combobox", { name: "관리자" });
    expect(admin).toHaveValue("2");
    expect(
      within(admin)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["모든 관리자", "운영자", "도우미"]);
    const action = within(form).getByRole("combobox", { name: "작업 종류" });
    expect(action).toHaveValue("group:role");
    const options = within(action)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toContain("관리자 권한 부여");
    expect(options).toContain("주제 숨김");
    expect(options).toContain("권한 · 모든 작업");
    expect(options).not.toContain("주제 추가");
    expect(options.at(-1)).toBe("EXTERNAL_BLOG_BLOCK");
    expect(within(form).getByRole("combobox", { name: "대상 종류" })).toHaveValue("USER");
    expect(within(form).getByRole("link", { name: "조건 지우기" })).toHaveAttribute(
      "href",
      "/admin/audit-log",
    );
  });

  it("표: 작업 이름(없는 코드는 그대로), 대상 링크, 사유, 펼치면 변경 전후와 상세 링크", async () => {
    renderLog(
      "/admin/audit-log",
      ok(
        [
          entry(1),
          entry(2, {
            action: "EXTERNAL_BLOG_BLOCK",
            targetType: "EXTERNAL_BLOG",
            targetId: null,
            targetKey: "feed.example",
            reason: "스팸",
            before: null,
            after: null,
          }),
          entry(3, { action: "RELEASE_NOTE_PUBLISH", targetType: "RELEASE_NOTE", targetId: 5 }),
        ],
        { totalCount: 3 },
      ),
    );

    const table = await screen.findByRole("table", { name: "작업 기록 목록" });
    expect(within(table).getByText("관리자 권한 부여")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "회원 #12" })).toHaveAttribute(
      "href",
      "/admin/users/12",
    );
    expect(within(table).getByText("EXTERNAL_BLOG_BLOCK")).toBeInTheDocument();
    expect(within(table).getByText("EXTERNAL_BLOG feed.example")).toBeInTheDocument();
    expect(within(table).getByText("스팸")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "릴리스 노트 #5" })).toHaveAttribute(
      "href",
      "/admin/release-notes/5",
    );
    const details = table.querySelectorAll("details");
    expect(details).toHaveLength(3);
    fireEvent.click(within(details[0] as HTMLElement).getByText("변경 내용"));
    expect(within(details[0] as HTMLElement).getByText("USER")).toBeInTheDocument();
    expect(within(details[0] as HTMLElement).getByRole("link", { name: "자세히" })).toHaveAttribute(
      "href",
      "/admin/audit-log/1",
    );
    expect(
      within(details[1] as HTMLElement).getByText("바뀐 값 기록이 없습니다."),
    ).toBeInTheDocument();
  });

  it("빈 결과·기간 오류 문구", async () => {
    renderLog("/admin/audit-log", ok([], { totalCount: 0 }));
    expect(await screen.findByText("조건에 맞는 기록이 없습니다.")).toBeInTheDocument();
  });

  it("기간 오류는 입력란 옆과 알림에", async () => {
    renderLog(
      "/admin/audit-log?from=2026-10-07&to=2026-10-01",
      fail(400, "VALIDATION_FAILED", [{ field: "to", code: "INVALID" }]),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("올바르지 않은 값");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("대상 주소 규칙", () => {
    expect(auditTargetHref({ targetType: "USER", targetId: null })).toBeNull();
    expect(auditTargetHref({ targetType: "TOPIC", targetId: 3 })).toBe("/admin/topics");
    expect(auditTargetHref({ targetType: "REPORT", targetId: 3 })).toBe("/admin/reports/3");
    expect(auditTargetHref({ targetType: "REPORT", targetId: null })).toBeNull();
    expect(auditTargetHref({ targetType: "RELEASE_NOTE", targetId: null })).toBeNull();
    expect(auditTargetHref({ targetType: "CURATION", targetId: 1 })).toBe(
      "/admin/portal/curations",
    );
    expect(auditTargetHref({ targetType: "SETTING", targetId: null })).toBe(
      "/admin/portal/settings",
    );
    expect(auditTargetHref({ targetType: "POST", targetId: 1 })).toBeNull();
  });
});

describe("admin audit log entry", () => {
  const ENTRY = "GET /api/v1/admin/audit-logs/1";

  function renderEntry(role: string, value: AuditLogEntry) {
    mockBackend({ [ME]: ok(member(role)), [ENTRY]: ok(value) });
    renderRoutes(
      [{ path: "admin/audit-log/:id", loader: stub(entryLoader), Component: AuditEntry }],
      {
        initialEntries: ["/admin/audit-log/1"],
      },
    );
  }

  it("최고 관리자에게는 요청 IP", async () => {
    renderEntry("SUPER_ADMIN", entry(1, { requestIp: "203.0.113.7", reason: "요청" }));
    expect(await screen.findByRole("heading", { name: "작업 기록 1" })).toBeInTheDocument();
    expect(screen.getByText("203.0.113.7")).toBeInTheDocument();
    expect(screen.getByText("요청")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "작업 기록으로" })).toHaveAttribute(
      "href",
      "/admin/audit-log",
    );
  });

  it("IP가 없으면 안내", async () => {
    renderEntry("SUPER_ADMIN", entry(1, { requestIp: null }));
    expect(await screen.findByText("기록된 IP가 없습니다.")).toBeInTheDocument();
  });

  it("일반 관리자에게는 최고 관리자만 볼 수 있다는 안내", async () => {
    renderEntry("ADMIN", entry(1, { requestIp: null }));
    expect(await screen.findByText("요청 IP는 최고 관리자만 볼 수 있습니다.")).toBeInTheDocument();
  });

  it("숫자가 아닌 번호·없는 기록은 404, meta noindex", async () => {
    mockBackend({ [ME]: ok(member()), "GET /api/v1/admin/audit-logs/9": fail(404, "NOT_FOUND") });
    const run = (id: string) =>
      entryLoader(routeArgs(getRequest(`/admin/audit-log/${id}`, loggedIn), { id }) as never);
    expect(statusOf(await caught(run("x")))).toBe(404);
    expect(statusOf(await caught(run("9")))).toBe(404);
    expect(entryMeta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });
});
