import type { RouteConfigEntry } from "@react-router/dev/routes";
import { describe, expect, it } from "vitest";

import routes from "~/routes";

/**
 * 최상위 경로 조각은 블로그 주소(handle)와 겹치면 안 되므로 모두 예약어여야 한다(FR-002, research.md R5).
 * 예약어 목록은 001 contracts/routes.md "예약어" 절을 그대로 옮겼다. backend `ReservedHandles`와 같은 목록이다.
 * 새 최상위 경로를 추가해 이 테스트가 실패하면 routes.md와 backend 상수에 같은 이름을 먼저 넣는다.
 */
const RESERVED_HANDLES = [
  "admin",
  "api",
  "assets",
  "static",
  "media",
  "public",
  "build",
  "favicon.ico",
  "robots.txt",
  "sitemap",
  "sitemap.xml",
  "signup",
  "login",
  "logout",
  "auth",
  "oauth",
  "me",
  "settings",
  "manage",
  "write",
  "edit",
  "password-reset",
  "search",
  "tags",
  "tag",
  "topics",
  "topic",
  "category",
  "feed",
  "rss",
  "atom",
  "notifications",
  "explore",
  "popular",
  "external",
  "external-blogs",
  "report",
  "reports",
  "rights-request",
  "trackback",
  "locale",
  "lang",
  "legal",
  "help",
  "about",
  "terms",
  "privacy",
  "policy",
  "notice",
  "support",
  "health",
  "blog",
  "www",
  "mail",
  "root",
  "system",
  "updates",
] as const;

/** contracts/routes.md "블로그별 하위 경로" 고정 이름 */
const BLOG_SUB_PATHS = [
  "category",
  "tag",
  "tags",
  "rss",
  "atom",
  "guestbook",
  "notice",
  "archive",
  "search",
  "manage",
  "write",
];

/** 경로 없는 레이아웃은 건너뛰고, 실제 주소의 첫 조각을 모은다. */
function topLevelSegments(entries: RouteConfigEntry[], parentPath = ""): string[] {
  return entries.flatMap((entry) => {
    const path = [parentPath, entry.path ?? ""].filter(Boolean).join("/");
    if (!entry.path && entry.children) {
      return topLevelSegments(entry.children, parentPath);
    }
    return path ? [path.split("/")[0]] : [];
  });
}

/** `/:handle/...` 아래의 고정 하위 경로 이름 */
function blogSubPaths(entries: RouteConfigEntry[]): string[] {
  return entries
    .filter((entry) => entry.path?.startsWith(":handle/"))
    .map((entry) => entry.path!.split("/")[1])
    .filter((segment) => !segment.startsWith(":"));
}

const config = routes as RouteConfigEntry[];

describe("최상위 경로와 예약어", () => {
  const segments = [...new Set(topLevelSegments(config))];
  const fixed = segments.filter((segment) => !segment.startsWith(":") && segment !== "*");

  it("고정 최상위 경로가 있다", () => {
    expect(fixed).toEqual(
      expect.arrayContaining(["signup", "login", "logout", "write", "settings"]),
    );
  });

  it("모든 고정 최상위 경로 조각이 예약어 목록에 있다", () => {
    const missing = fixed.filter(
      (segment) => !(RESERVED_HANDLES as readonly string[]).includes(segment),
    );
    expect(missing).toEqual([]);
  });

  it("동적 최상위 조각은 블로그 주소(:handle)와 404(*)뿐이다", () => {
    expect(segments.filter((segment) => segment.startsWith(":") || segment === "*").sort()).toEqual(
      [":handle", "*"].sort(),
    );
  });

  it("블로그별 고정 하위 경로는 routes.md 목록에 있다", () => {
    const missing = blogSubPaths(config).filter((segment) => !BLOG_SUB_PATHS.includes(segment));
    expect(missing).toEqual([]);
  });

  it("어디에도 맞지 않는 주소(*)는 맨 끝이다", () => {
    expect(config.at(-1)?.path).toBe("*");
  });
});
