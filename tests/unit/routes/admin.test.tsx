// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ADMIN_ROLES, isAdminDenied, requireAdmin, throwAdminError } from "~/admin/access.server";
import { ADMIN_HOME, ADMIN_MENU } from "~/admin/links";
import { ApiError } from "~/api/errors";
import { loader as indexLoader } from "~/routes/admin/index";
import Layout, { loader as layoutLoader, meta as layoutMeta } from "~/routes/admin/layout";
import { meta as curationsMeta } from "~/routes/admin/curations";
import { meta as exclusionsMeta } from "~/routes/admin/exclusions";
import { meta as settingsMeta } from "~/routes/admin/settings";
import Topics, { loader as topicsLoader, meta as topicsMeta } from "~/routes/admin/topics";
import routes from "~/routes";

import { ME, adminTopic, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import { caught, expectRedirect, getRequest, routeArgs, statusOf } from "../support/route";

type Args = Parameters<typeof layoutLoader>[0];
const call = (
  fn: (args: Args) => unknown,
  path: string,
  headers: Record<string, string> = loggedIn,
) => fn(routeArgs<Args>(getRequest(path, headers)));

/** 관리자 콘솔 접근·메뉴·noindex(003 T089) */
describe("/admin 접근", () => {
  it("비로그인은 /login?next=로", async () => {
    mockBackend({ [ME]: fail(401, "UNAUTHENTICATED") });

    const location = new URL(
      expectRedirect(await caught(call(layoutLoader, "/admin/topics"))),
      "http://front.test",
    );
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/admin/topics");
  });

  it("세션 role이 USER면 404, ADMIN·SUPER_ADMIN은 연다", async () => {
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call(layoutLoader, "/admin/topics")))).toBe(404);

    for (const role of ["ADMIN", "SUPER_ADMIN"]) {
      mockBackend({ [ME]: ok(member(role)) });
      await expect(call(layoutLoader, "/admin/topics")).resolves.toEqual({ nickname: "운영자" });
    }
    expect(ADMIN_ROLES).toEqual(["ADMIN", "SUPER_ADMIN"]);
  });

  it("backend가 404 NOT_FOUND(권한 회수)를 주면 화면도 404", async () => {
    mockBackend({ [ME]: ok(member()), "GET /api/v1/admin/topics": fail(404, "NOT_FOUND") });

    expect(statusOf(await caught(call(topicsLoader as never, "/admin/topics")))).toBe(404);
  });

  it("그 밖의 backend 오류는 같은 상태 코드", async () => {
    mockBackend({ [ME]: ok(member()), "GET /api/v1/admin/topics": fail(500, "INTERNAL_ERROR") });

    expect(statusOf(await caught(call(topicsLoader as never, "/admin/topics")))).toBe(500);
  });

  it("/admin은 /admin/topics로, 관리자가 아니면 404", async () => {
    mockBackend({ [ME]: ok(member()) });
    expect(expectRedirect(await call(indexLoader as never, "/admin"))).toBe("/admin/topics");
    expect(ADMIN_HOME).toBe("/admin/topics");

    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call(indexLoader as never, "/admin")))).toBe(404);
  });

  it("관리자 아님 판정: 403과 404 NOT_FOUND만(다른 404 코드는 아님)", () => {
    const error = (status: number, resultCode: string) =>
      new ApiError({ status, resultCode, resultMessage: "", fieldErrors: [] });
    expect(isAdminDenied(error(403, "FORBIDDEN"))).toBe(true);
    expect(isAdminDenied(error(404, "NOT_FOUND"))).toBe(true);
    expect(isAdminDenied(error(404, "POST_NOT_FOUND"))).toBe(false);
    expect(isAdminDenied(new Error("x"))).toBe(false);
    expect(() => throwAdminError(new Error("boom"))).toThrow("boom");
  });

  it("requireAdmin은 세션 회원을 돌려준다", async () => {
    mockBackend({ [ME]: ok(member()) });
    await expect(requireAdmin(getRequest("/admin", loggedIn))).resolves.toMatchObject({
      role: "ADMIN",
    });
  });
});

describe("/admin 화면", () => {
  it("좌측 메뉴는 주제·포털 추천·포털 제외·포털 설정 4개", async () => {
    mockBackend({ [ME]: ok(member()), "GET /api/v1/admin/topics": ok([adminTopic(1, "dev")]) });
    renderRoutes(
      [
        {
          path: "admin",
          loader: stub(layoutLoader),
          Component: Layout,
          children: [{ path: "topics", loader: stub(topicsLoader), Component: Topics }],
        },
      ],
      { initialEntries: ["/admin/topics"] },
    );

    const menu = await screen.findByRole("navigation", { name: "관리자 메뉴" });
    const links = within(menu).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "주제",
      "포털 추천",
      "포털 제외",
      "포털 설정",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      ADMIN_MENU.map((item) => item.path),
    );
    expect(screen.getByText("운영자")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "주제 관리" })).toBeInTheDocument();
  });

  it.each([
    ["레이아웃", layoutMeta, "관리자 콘솔 - 블로그"],
    ["주제", topicsMeta, "주제 관리 - 블로그"],
    ["추천", curationsMeta, "포털 추천 - 블로그"],
    ["제외", exclusionsMeta, "포털 제외 - 블로그"],
    ["설정", settingsMeta, "포털 설정 - 블로그"],
  ] as const)("%s 화면은 noindex", (_name, meta, title) => {
    expect((meta as (args: never) => unknown)(metaArgs())).toEqual([
      { title },
      { name: "robots", content: "noindex" },
    ]);
  });

  it("라우트: /admin 아래 4개 화면이 /:handle 계열보다 앞에", () => {
    const paths = routes.map((route) => route.path);
    const admin = routes.find((route) => route.path === "admin");
    expect(paths.indexOf("admin")).toBeLessThan(paths.indexOf(":handle"));
    expect(admin?.children?.map((child) => child.path ?? "(index)")).toEqual([
      "(index)",
      "topics",
      "portal/curations",
      "portal/exclusions",
      "portal/settings",
    ]);
  });
});
