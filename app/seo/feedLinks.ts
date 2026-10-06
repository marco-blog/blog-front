import type { TFunction } from "i18next";
import type { MetaDescriptor } from "react-router";

/** 피드 자동 발견에 쓰는 블로그 정보 */
export interface FeedLinkBlog {
  handle: string;
  title: string;
}

export const RSS_TYPE = "application/rss+xml";
export const ATOM_TYPE = "application/atom+xml";

function alternate(type: string, title: string, href: string): MetaDescriptor {
  return { tagName: "link", rel: "alternate", type, title, href };
}

/**
 * 블로그 RSS·Atom 자동 발견 `<link rel="alternate">`(002 FR-048). 주소는 서비스 출처 기준 절대 주소,
 * 제목은 `{블로그 제목} RSS`·`{블로그 제목} Atom`(discovery:feedLink.*).
 */
export function blogFeedLinks(t: TFunction, origin: string, blog: FeedLinkBlog): MetaDescriptor[] {
  const base = new URL(`/${blog.handle}`, origin).toString();
  return [
    alternate(RSS_TYPE, t("discovery:feedLink.rss", { title: blog.title }), `${base}/rss`),
    alternate(ATOM_TYPE, t("discovery:feedLink.atom", { title: blog.title }), `${base}/atom`),
  ];
}

/** 카테고리 RSS 자동 발견(`{카테고리} - {블로그 제목} RSS`). 카테고리 Atom은 없다(002 결정 13). */
export function categoryFeedLink(
  t: TFunction,
  origin: string,
  blog: FeedLinkBlog,
  category: { id: number; name: string },
): MetaDescriptor {
  return alternate(
    RSS_TYPE,
    t("discovery:feedLink.category", { category: category.name, title: blog.title }),
    new URL(`/${blog.handle}/category/${category.id}/rss`, origin).toString(),
  );
}
