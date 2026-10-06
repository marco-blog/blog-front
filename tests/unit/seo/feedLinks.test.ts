import { describe, expect, it } from "vitest";

import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import { ATOM_TYPE, blogFeedLinks, categoryFeedLink, RSS_TYPE } from "~/seo/feedLinks";

const t = (language: "ko" | "en" | "ja" | "zh-CN") =>
  createI18n(language, resourcesFor(language)).t;

/** 피드 자동 발견 링크(T088, 002 FR-048) */
describe("feedLinks", () => {
  it("블로그 RSS·Atom: 서비스 출처 기준 절대 주소와 번역된 제목", () => {
    expect(
      blogFeedLinks(t("ko"), "https://blog.java21.net", { handle: "marco", title: "마르코" }),
    ).toEqual([
      {
        tagName: "link",
        rel: "alternate",
        type: RSS_TYPE,
        title: "마르코 RSS",
        href: "https://blog.java21.net/marco/rss",
      },
      {
        tagName: "link",
        rel: "alternate",
        type: ATOM_TYPE,
        title: "마르코 Atom",
        href: "https://blog.java21.net/marco/atom",
      },
    ]);
    expect(RSS_TYPE).toBe("application/rss+xml");
    expect(ATOM_TYPE).toBe("application/atom+xml");
  });

  it("카테고리 RSS: `{카테고리} - {블로그 제목} RSS`", () => {
    expect(
      categoryFeedLink(
        t("en"),
        "http://front.test",
        { handle: "marco", title: "Marco's blog" },
        { id: 12, name: "Spring" },
      ),
    ).toEqual({
      tagName: "link",
      rel: "alternate",
      type: RSS_TYPE,
      title: "Spring - Marco's blog RSS",
      href: "http://front.test/marco/category/12/rss",
    });
  });

  it("제목에 HTML 특수 문자가 있어도 그대로(이스케이프는 렌더러가 한다)", () => {
    const [rss] = blogFeedLinks(t("ja"), "https://blog.java21.net", {
      handle: "marco",
      title: "A & <B>",
    });
    expect(rss).toMatchObject({ title: "A & <B> RSS" });
  });
});
