import { describe, expect, it } from "vitest";

import { MANAGE_MENU, postHref } from "~/manage/links";
import { POST_STATUS_FILTERS, POST_VISIBILITY_FILTERS, oneOf } from "~/manage/postFilters";
import routes from "~/routes";

/** `/:handle/manage` 아래 화면 경로(index는 "") */
function managePaths(): string[] {
  const manage = routes.find((route) => route.path === ":handle/manage");
  return (manage?.children ?? []).map((child) => (child.index ? "" : `/${child.path}`));
}

/** 블로그 관리 메뉴(006 FR-099, T009) */
describe("MANAGE_MENU", () => {
  it("FR-099 표 순서", () => {
    expect(MANAGE_MENU.map((item) => item.key)).toEqual([
      "dashboard",
      "posts",
      "categories",
      "comments",
      "guestbook",
      "settings",
      "design",
      "feed",
      "stats",
      "trackbacks",
      "backup",
      "blocks",
      "externalBlogs",
    ]);
  });

  it("보이는 항목의 경로는 routes.ts의 manage 자식에 있고, 외부 블로그는 숨김(받은 트랙백은 005가 켰다)", () => {
    const paths = managePaths();
    for (const item of MANAGE_MENU) {
      expect(paths.includes(item.path), item.key).toBe(item.available);
    }
    expect(MANAGE_MENU.filter((item) => !item.available).map((item) => item.key)).toEqual([
      "externalBlogs",
    ]);
  });

  it("글 주소: 발행한 글은 글 화면, 나머지는 작성 화면(SC-016)", () => {
    expect(postHref("marco", { id: 3, status: "PUBLISHED" })).toBe("/marco/3");
    expect(postHref("marco", { id: 4, status: "DRAFT" })).toBe("/marco/write/4");
  });
});

describe("postFilters", () => {
  it("상태·공개 범위 값과 모르는 값 버리기(T018)", () => {
    expect(POST_STATUS_FILTERS).toEqual(["DRAFT", "PUBLISHED", "SCHEDULED", "DELETED", "HIDDEN"]);
    expect(POST_VISIBILITY_FILTERS).toEqual(["PUBLIC", "PRIVATE", "PROTECTED"]);
    expect(oneOf(POST_STATUS_FILTERS, "DRAFT")).toBe("DRAFT");
    expect(oneOf(POST_STATUS_FILTERS, "draft")).toBeNull();
    expect(oneOf(POST_STATUS_FILTERS, null)).toBeNull();
  });
});
