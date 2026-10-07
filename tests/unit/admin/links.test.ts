import { describe, expect, it } from "vitest";

import { ADMIN_HOME, ADMIN_MENU, adminMenuSections } from "~/admin/links";
import { isAdmin, isSuperAdmin } from "~/admin/roles";
import routes from "~/routes";

/** `/admin` 아래 화면 경로 전체(index는 `/admin`) */
function adminPaths(): string[] {
  const admin = routes.find((route) => route.path === "admin");
  return (admin?.children ?? []).map((child) => (child.index ? "/admin" : `/admin/${child.path}`));
}

/** 콘솔 메뉴(006 contracts/routes.md "콘솔 메뉴", T009) */
describe("ADMIN_MENU", () => {
  it("FR-102 표 순서와 묶음", () => {
    expect(ADMIN_MENU.map((item) => [item.key, item.group])).toEqual([
      ["dashboard", "operations"],
      ["topics", "portal"],
      ["curations", "portal"],
      ["exclusions", "portal"],
      ["settings", "portal"],
      ["users", "operations"],
      ["contents", "operations"],
      ["reports", "operations"],
      ["externalBlogs", "portal"],
      ["spam", "operations"],
      ["reservedHandles", "service"],
      ["serviceSettings", "service"],
      ["admins", "service"],
      ["auditLog", "service"],
      ["releaseNotes", "service"],
    ]);
    expect(ADMIN_HOME).toBe("/admin");
    // 005 숨긴 글 메뉴는 006 T039가 콘텐츠 관리(`?status=HIDDEN`)로 흡수했다
    expect(ADMIN_MENU.some((item) => item.path === "/admin/contents/hidden-posts")).toBe(false);
  });

  it("보이는 항목의 경로는 routes.ts에 있고, 007이 외부 블로그 관리를 켰다(숨긴 항목 없음)", () => {
    const paths = adminPaths();
    for (const item of ADMIN_MENU) {
      expect(paths.includes(item.path), item.key).toBe(item.available);
    }
    expect(ADMIN_MENU.filter((item) => !item.available).map((item) => item.key)).toEqual([]);
  });

  it("묶음은 바뀔 때마다 나뉜다(보이는 항목만)", () => {
    expect(adminMenuSections().map((section) => [section.group, section.items.length])).toEqual([
      ["operations", 1],
      ["portal", 4],
      ["operations", 3],
      ["portal", 1],
      ["operations", 1],
      ["service", 5],
    ]);
    expect(adminMenuSections([])).toEqual([]);
  });
});

describe("roles", () => {
  it("관리자·최고 관리자 판정", () => {
    expect([null, undefined, "USER", "ADMIN", "SUPER_ADMIN"].map((role) => isAdmin(role))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(["USER", "ADMIN", "SUPER_ADMIN", null].map((role) => isSuperAdmin(role))).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });
});
