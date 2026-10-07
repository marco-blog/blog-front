// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminUserSummary } from "~/api/models";
import Users, { loader, meta, usersHref } from "~/routes/admin/users";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
const LIST = "GET /api/v1/admin/users";
const call = (path: string) => loader(routeArgs<LoaderArgs>(getRequest(path, loggedIn)));

const summary = (id: number, overrides: Partial<AdminUserSummary> = {}): AdminUserSummary => ({
  id,
  nickname: `회원${id}`,
  status: "ACTIVE",
  role: "USER",
  createdAt: "2026-01-02T00:00:00Z",
  blogCount: 1,
  ...overrides,
});

/** 회원 관리(005 T046) */
describe("admin users loader", () => {
  it("검색어가 2자 이상일 때만 GET /admin/users(q·by·page 0부터)", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [LIST]: ok([summary(1)], { totalCount: 1 }),
    });

    await expect(call("/admin/users")).resolves.toMatchObject({ users: null, tooShort: false });
    await expect(call("/admin/users?q=a")).resolves.toMatchObject({ users: null, tooShort: true });
    expect(backend.callsTo(LIST)).toHaveLength(0);

    await expect(call("/admin/users?q=%20marco%20&by=handle&page=2")).resolves.toMatchObject({
      q: "marco",
      by: "handle",
      users: [summary(1)],
      totalCount: 1,
    });
    expect(Object.fromEntries(backend.callsTo(LIST)[0].url.searchParams)).toEqual({
      q: "marco",
      by: "handle",
      page: "1",
      size: "20",
    });
    await call("/admin/users?q=ma&by=phone");
    expect(backend.callsTo(LIST)[1].url.searchParams.get("by")).toBe("nickname");
  });

  it("관리자가 아니면 404, 주소 만들기, meta", async () => {
    mockBackend({ [ME]: ok(member()), [LIST]: fail(404, "NOT_FOUND") });
    expect(statusOf(await caught(call("/admin/users?q=ma")))).toBe(404);
    expect(usersHref("ma", "email", 2)).toBe("/admin/users?q=ma&by=email&page=2");
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });
});

describe("admin users 화면", () => {
  function renderUsers(entry: string, users: AdminUserSummary[] = []) {
    mockBackend({ [ME]: ok(member()), [LIST]: ok(users, { totalCount: users.length }) });
    renderRoutes([{ path: "admin/users", loader: stub(loader), Component: Users }], {
      initialEntries: [entry],
    });
  }

  it("검색 방식 선택과 결과 표(닉네임 링크·상태·권한·가입일·블로그 수)", async () => {
    renderUsers("/admin/users?q=marc&by=nickname", [
      summary(1, { nickname: "marco" }),
      summary(2, { nickname: "marcus", status: "SUSPENDED", role: "ADMIN", blogCount: 2 }),
    ]);

    const search = await screen.findByRole("search");
    expect(within(search).getByRole("combobox", { name: "찾는 방법" })).toHaveValue("nickname");
    expect(
      within(search)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["닉네임(앞부분)", "이메일(정확히)", "블로그 주소(정확히)"]);
    expect(within(search).getByRole("searchbox", { name: "검색어" })).toHaveValue("marc");
    const table = screen.getByRole("table", { name: "회원 목록" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByRole("link", { name: "marco" })).toHaveAttribute(
      "href",
      "/admin/users/1",
    );
    expect(rows[2]).toHaveTextContent("marcus정지관리자");
    expect(rows[2]).toHaveTextContent("2");
  });

  it("짧은 검색어는 안내, 결과가 없으면 안내", async () => {
    renderUsers("/admin/users?q=m");
    expect(await screen.findByText("2자 이상 입력해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("결과가 없으면 안내", async () => {
    renderUsers("/admin/users?q=nobody");
    expect(await screen.findByText("조건에 맞는 회원이 없습니다.")).toBeInTheDocument();
  });
});
