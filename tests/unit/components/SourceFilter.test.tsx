// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceFilter } from "~/components/portal/SourceFilter";
import { parseSource, type PortalSource, sourceHref, sourceQuery } from "~/external/sourceFilter";
import { visitHref, visitPath, VISIT_PATH_PATTERN } from "~/external/visit";
import type { Language } from "~/i18n/config";
import { latestFetchHref, latestHref } from "~/portal/cursor";

import { renderRoutes } from "../support/render";

function renderFilter(current: PortalSource, language: Language = "ko") {
  return renderRoutes(
    [
      {
        index: true,
        Component: () => (
          <SourceFilter current={current} hrefFor={(value) => sourceHref("/", value)} />
        ),
      },
    ],
    { language },
  );
}

/** 출처 필터(007 T050, FR-120) */
describe("SourceFilter", () => {
  it("세 값을 링크로, 지금 값은 aria-current", async () => {
    renderFilter("external");

    const nav = await screen.findByRole("navigation", { name: "출처" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["전체", "내부 글만", "외부 글만"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/?source=internal",
      "/?source=external",
    ]);
    expect(within(nav).getByRole("link", { name: "외부 글만" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "전체" })).not.toHaveAttribute("aria-current");
  });

  it.each([
    ["en", ["All", "Posts here", "External posts"]],
    ["ja", null],
    ["zh-CN", null],
  ] as const)("화면 언어(%s)로 표시", async (language, expected) => {
    renderFilter("all", language);
    const links = within(await screen.findByRole("navigation")).getAllByRole("link");
    expect(links).toHaveLength(3);
    if (expected) {
      expect(links.map((link) => link.textContent)).toEqual(expected);
    }
    for (const link of links) {
      expect(link.textContent).not.toMatch(/^portal:/);
    }
  });
});

describe("sourceFilter", () => {
  it("parseSource는 세 값만, 그 밖은 전체", () => {
    expect(parseSource("internal")).toBe("internal");
    expect(parseSource("external")).toBe("external");
    expect(parseSource("all")).toBe("all");
    expect(parseSource("EXTERNAL")).toBe("all");
    expect(parseSource(null)).toBe("all");
    expect(parseSource(undefined)).toBe("all");
  });

  it("sourceQuery는 전체면 보내지 않는다", () => {
    expect(sourceQuery("all")).toBeUndefined();
    expect(sourceQuery("external")).toBe("external");
  });

  it("sourceHref는 커서·페이지를 버리고 남길 값만 싣는다", () => {
    expect(sourceHref("/topics/knowledge", "external", { sort: "popular", page: undefined })).toBe(
      "/topics/knowledge?sort=popular&source=external",
    );
    expect(sourceHref("/topics/knowledge", "all", { sort: undefined })).toBe("/topics/knowledge");
  });

  it("더 보기 주소는 출처를 이어 간다", () => {
    expect(latestHref("c1", "external")).toBe("/?source=external&cursor=c1");
    expect(latestFetchHref("c1", "internal")).toBe("/?index&source=internal&cursor=c1");
    expect(latestHref("c1")).toBe("/?cursor=c1");
  });
});

describe("visit", () => {
  it("visitUrl이 있으면 그대로, 없으면 같은 규칙", () => {
    expect(visitHref({ id: 3, visitUrl: "/api/v1/external-posts/3/visit" })).toBe(
      "/api/v1/external-posts/3/visit",
    );
    expect(visitHref({ id: 4, visitUrl: null })).toBe(visitPath(4));
    expect(VISIT_PATH_PATTERN.test(visitPath(4))).toBe(true);
    expect(VISIT_PATH_PATTERN.test("/api/v1/external-posts/4/visit/x")).toBe(false);
  });
});
