// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminMember } from "~/api/models";
import Admins, { action, loader, meta } from "~/routes/admin/admins";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type ActionArgs = Parameters<typeof action>[0];
const ADMINS = "GET /api/v1/admin/admins";
const ROLE = (id: number) => `PUT /api/v1/admin/users/${id}/role`;

const admin = (userId: number, overrides: Partial<AdminMember> = {}): AdminMember => ({
  userId,
  nickname: `관리자${userId}`,
  role: "ADMIN",
  status: "ACTIVE",
  createdAt: "2026-03-01T00:00:00Z",
  ...overrides,
});
const list = [
  admin(1, { nickname: "운영자", role: "SUPER_ADMIN" }),
  admin(2, { status: "SUSPENDED" }),
];

const post = (fields: Record<string, string>) =>
  action(routeArgs<ActionArgs>(formRequest("/admin/admins", fields, loggedIn)));

/** 관리자 권한(006 T048) */
describe("admin admins loader·action", () => {
  it("loader: 목록과 바꿀 수 있는지(SUPER_ADMIN만), 관리자가 아니면 404", async () => {
    mockBackend({ [ME]: ok(member("SUPER_ADMIN")), [ADMINS]: ok(list) });
    const run = () => loader(routeArgs(getRequest("/admin/admins", loggedIn)) as never);
    await expect(run()).resolves.toEqual({ admins: list, canChange: true });
    mockBackend({ [ME]: ok(member("ADMIN")), [ADMINS]: ok(list) });
    await expect(run()).resolves.toEqual({ admins: list, canChange: false });
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(run()))).toBe(404);
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("action: intent=role → PUT /admin/users/{id}/role {role}", async () => {
    const changed = admin(5, { nickname: "새 관리자" });
    const backend = mockBackend({ [ME]: ok(member("SUPER_ADMIN")), [ROLE(5)]: ok(changed) });

    expect(
      asData(await post({ intent: "role", userId: " 5 ", role: "ADMIN", confirm: "yes" })).data,
    ).toEqual({
      intent: "role",
      ok: true,
      member: changed,
    });
    expect(backend.callsTo(ROLE(5))[0].body).toEqual({ role: "ADMIN" });
  });

  it("action: 확인 체크·번호·권한 값 검사(400), 모르는 intent", async () => {
    const backend = mockBackend({ [ME]: ok(member("SUPER_ADMIN")) });
    const result = asData<{ fieldErrors: unknown[] }>(
      await post({ intent: "role", userId: "abc", role: "OWNER" }),
    );
    expect(result.init?.status).toBe(400);
    expect(result.data.fieldErrors).toEqual([
      { field: "userId", code: "INVALID" },
      { field: "role", code: "INVALID" },
      { field: "confirm", code: "REQUIRED" },
    ]);
    expect(
      asData<{ fieldErrors: unknown[] }>(
        await post({ intent: "role", userId: "", role: "USER", confirm: "yes" }),
      ).data.fieldErrors,
    ).toEqual([{ field: "userId", code: "REQUIRED" }]);
    expect(asData(await post({ intent: "other" })).init?.status).toBe(400);
    expect(backend.calls.filter((call) => call.method === "PUT")).toHaveLength(0);
  });

  it.each([
    [422, "CANNOT_CHANGE_OWN_ROLE"],
    [409, "LAST_SUPER_ADMIN"],
    [409, "USER_NOT_ACTIVE"],
    [404, "USER_NOT_FOUND"],
  ])("action: backend %s %s는 폼 오류", async (status, code) => {
    mockBackend({ [ME]: ok(member("SUPER_ADMIN")), [ROLE(5)]: fail(status, code) });
    const result = asData(
      await post({ intent: "role", userId: "5", role: "USER", confirm: "yes" }),
    );
    expect(result.data).toMatchObject({ ok: false, resultCode: code });
    expect(result.init?.status).toBe(status);
  });

  it("action: 403(최고 관리자가 아님)은 콘솔 404", async () => {
    mockBackend({ [ME]: ok(member("ADMIN")), [ROLE(5)]: fail(403, "FORBIDDEN") });
    expect(
      statusOf(await caught(post({ intent: "role", userId: "5", role: "USER", confirm: "yes" }))),
    ).toBe(404);
  });
});

describe("admin admins 화면", () => {
  function renderAdmins(role: string, routes: Record<string, Response> = {}) {
    mockBackend({ [ME]: ok(member(role)), [ADMINS]: ok(list), ...routes });
    renderRoutes(
      [{ path: "admin/admins", loader: stub(loader), action: stub(action), Component: Admins }],
      { initialEntries: ["/admin/admins"] },
    );
  }

  it("최고 관리자: 목록(권한·상태)과 행마다 권한 바꾸기, 회원 번호로 지정 폼", async () => {
    renderAdmins("SUPER_ADMIN");

    const table = await screen.findByRole("table", { name: "관리자 목록" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByRole("link", { name: "운영자" })).toHaveAttribute(
      "href",
      "/admin/users/1",
    );
    expect(rows[1]).toHaveTextContent("최고 관리자");
    expect(rows[2]).toHaveTextContent("정지");
    const rowForm = within(rows[2]).getByRole("group", { name: "관리자2 권한 바꾸기" });
    expect(within(rowForm).getByRole("combobox", { name: "새 권한" })).toHaveValue("ADMIN");
    expect(
      within(within(rowForm).getByRole("combobox"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["회원", "관리자", "최고 관리자"]);
    expect(
      within(rowForm).getByRole("checkbox", { name: "권한을 바꾸는 것을 확인했습니다" }),
    ).toBeRequired();
    const grant = screen.getByRole("group", { name: "회원 번호로 관리자 지정" });
    expect(within(grant).getByRole("textbox", { name: "회원 번호" })).toBeInTheDocument();
    expect(within(grant).getByRole("button", { name: "지정" })).toBeInTheDocument();
  });

  it("일반 관리자: 읽기 전용", async () => {
    renderAdmins("ADMIN");

    expect(
      await screen.findByText("권한 변경은 최고 관리자만 할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "권한 바꾸기" })).toBeNull();
  });

  it("권한을 바꾸면 안내, 실패하면 오류 문구", async () => {
    renderAdmins("SUPER_ADMIN", {
      [ROLE(2)]: ok(admin(2, { role: "SUPER_ADMIN" })),
      [ROLE(1)]: fail(422, "CANNOT_CHANGE_OWN_ROLE"),
    });

    const rows = within(await screen.findByRole("table", { name: "관리자 목록" })).getAllByRole(
      "row",
    );
    const form = within(rows[2]).getByRole("group", { name: "관리자2 권한 바꾸기" });
    fireEvent.change(within(form).getByRole("combobox"), { target: { value: "SUPER_ADMIN" } });
    fireEvent.click(within(form).getByRole("checkbox"));
    fireEvent.click(within(form).getByRole("button", { name: "바꾸기" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "관리자2 님의 권한을 최고 관리자(으)로 바꿨습니다.",
    );

    const own = within(rows[1]).getByRole("group", { name: "운영자 권한 바꾸기" });
    fireEvent.change(within(own).getByRole("combobox"), { target: { value: "USER" } });
    fireEvent.click(within(own).getByRole("checkbox"));
    fireEvent.click(within(own).getByRole("button", { name: "바꾸기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("자기 권한은 바꿀 수 없습니다.");
  });

  it("관리자가 없으면 안내", async () => {
    mockBackend({ [ME]: ok(member("SUPER_ADMIN")), [ADMINS]: ok([]) });
    renderRoutes([{ path: "admin/admins", loader: stub(loader), Component: Admins }], {
      initialEntries: ["/admin/admins"],
    });
    expect(await screen.findByText("관리자가 없습니다.")).toBeInTheDocument();
  });
});
