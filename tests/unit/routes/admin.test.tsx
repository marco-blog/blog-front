// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ADMIN_ROLES, isAdminDenied, requireAdmin, throwAdminError } from "~/admin/access.server";
import { ADMIN_HOME, ADMIN_MENU } from "~/admin/links";
import { ApiError } from "~/api/errors";
import { loader as dashboardLoader } from "~/routes/admin/dashboard";
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

/** 블로그 주소(`/:handle/...`) 계열의 첫 라우트 위치(004부터 공개 블로그 화면은 경로 없는 레이아웃 안에 있다) */
function firstBlogRoute(paths: (string | undefined)[]): number {
  const index = paths.findIndex((path) => path?.startsWith(":handle"));
  expect(index).toBeGreaterThan(0);
  return index;
}

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
      await expect(call(layoutLoader, "/admin/topics")).resolves.toEqual({
        nickname: "운영자",
        role,
        pendingReports: 0,
      });
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

  it("/admin은 리다이렉트가 아니라 대시보드(GET /admin/dashboard), 관리자가 아니면 404(006 T025)", async () => {
    const dashboard = {
      today: { signups: 0, publishedPosts: 0, comments: 0 },
      totals: { members: 0, blogs: 0, publicPosts: 0 },
      pendingReports: null,
      trend: [],
      timeZone: "Asia/Seoul",
      generatedAt: "2026-10-07T00:00:00Z",
    };
    const backend = mockBackend({
      [ME]: ok(member()),
      "GET /api/v1/admin/dashboard": ok(dashboard),
    });
    await expect(call(dashboardLoader as never, "/admin")).resolves.toMatchObject({ dashboard });
    expect(backend.callsTo("GET /api/v1/admin/dashboard")).toHaveLength(1);
    expect(ADMIN_HOME).toBe("/admin");

    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call(dashboardLoader as never, "/admin")))).toBe(404);

    mockBackend({ [ME]: ok(member()), "GET /api/v1/admin/dashboard": fail(404, "NOT_FOUND") });
    expect(statusOf(await caught(call(dashboardLoader as never, "/admin")))).toBe(404);
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
  it("좌측 메뉴는 묶음 제목과 available 항목만, 머리글에 관리자 권한 이름(006 T025)", async () => {
    mockBackend({
      [ME]: ok(member("SUPER_ADMIN")),
      "GET /api/v1/admin/topics": ok([adminTopic(1, "dev")]),
      "GET /api/v1/admin/reports/summary": ok({ pendingCount: 3 }),
    });
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
    expect(
      within(menu)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual(["운영", "포털", "운영", "포털", "운영", "서비스"]);
    const links = within(menu).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "대시보드",
      "주제",
      "포털 추천",
      "포털 제외",
      "포털 설정",
      "회원 관리",
      "콘텐츠 관리",
      "신고 관리 처리 대기 3건",
      "외부 블로그 관리",
      "스팸 방어 설정",
      "예약어",
      "서비스 설정",
      "관리자 권한",
      "작업 기록",
      "릴리스 노트",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      ADMIN_MENU.filter((item) => item.available).map((item) => item.path),
    );
    // 대시보드(`/admin`)는 하위 화면에서 현재 메뉴가 아니다(end)
    expect(within(menu).getByRole("link", { name: "대시보드" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(menu).getByRole("link", { name: "주제" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(menu).getByRole("link", { name: "외부 블로그 관리" })).toHaveAttribute(
      "href",
      "/admin/external-blogs",
    );
    expect(menu.closest("details")).toHaveAttribute("open");
    expect(screen.getByText("운영자")).toBeInTheDocument();
    expect(screen.getByText("최고 관리자")).toBeInTheDocument();
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

  it("라우트: /admin 아래 화면(003 4개, 005 신고·회원·숨긴 글·스팸, 006 콘솔)이 /:handle 계열보다 앞에", () => {
    const paths = routes.map((route) => route.path);
    const admin = routes.find((route) => route.path === "admin");
    expect(paths.indexOf("admin")).toBeLessThan(firstBlogRoute(paths));
    expect(admin?.children?.map((child) => child.path ?? "(index)")).toEqual([
      "(index)",
      "topics",
      "portal/curations",
      "portal/exclusions",
      "portal/settings",
      "reports",
      "reports/:id",
      "users",
      "users/:id",
      "contents/hidden-posts",
      "spam",
      "contents",
      "contents/posts",
      "contents/comments",
      "contents/guestbook",
      "reserved-handles",
      "settings",
      "admins",
      "audit-log",
      "audit-log/:id",
      "release-notes",
      "release-notes/new",
      "release-notes/:id",
      "release-notes/:id/revisions",
      "release-notes/:id/revisions/:revisionNo",
      "external-blogs",
      "external-blogs/new",
      "external-blogs/reviews",
      "external-blogs/stats",
      "external-blogs/rules",
      "external-blogs/settings",
      "external-blogs/:id",
    ]);
  });
});
