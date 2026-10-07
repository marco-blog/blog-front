// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SIDEBAR_ITEM_TYPES, type SidebarView } from "~/api/models";
import type { Language } from "~/i18n/config";
import { Sidebar, type SidebarBlog } from "~/components/blog/Sidebar";

import { renderRoutes } from "../support/render";

const sidebarBlog: SidebarBlog = {
  handle: "marco",
  description: "자바와 스프링 이야기",
  owner: {
    nickname: "마르코",
    profileImageUrl: "/media/Pf9Yy8Xx7Ww6Vv5Uu4Tt3S",
    bio: "백엔드 개발자",
  },
  categories: [{ id: 12, name: "Spring", postCount: 3, children: [] }],
};

const full: SidebarView = {
  items: [...SIDEBAR_ITEM_TYPES],
  recentPosts: [{ id: 123, title: "첫 글", publishedAt: "2026-10-06T04:24:19Z" }],
  popularPosts: [{ id: 7, title: "인기 글 하나", publishedAt: "2026-10-01T00:00:00Z" }],
  recentComments: [
    {
      id: 9,
      postId: 123,
      postTitle: "첫 글",
      excerpt: "좋은 글이네요",
      authorName: "손님",
      guest: true,
      createdAt: "2026-10-06T05:00:00Z",
    },
    {
      id: 10,
      postId: 123,
      postTitle: "첫 글",
      excerpt: "동의합니다",
      authorName: "리더",
      guest: false,
      createdAt: "2026-10-06T06:00:00Z",
    },
  ],
  tags: [
    { name: "spring", postCount: 14 },
    { name: "jpa", postCount: 1 },
  ],
  archive: [
    { year: 2026, month: 10, postCount: 3 },
    { year: 2026, month: 9, postCount: 1 },
  ],
  visitors: { today: 12, yesterday: 30, total: 1520 },
};

function renderSidebar(view: SidebarView | null, language: Language = "ko") {
  renderRoutes([{ path: ":handle", Component: () => <Sidebar blog={sidebarBlog} view={view} /> }], {
    initialEntries: ["/marco"],
    language,
  });
  return screen.findByRole("complementary");
}

function section(aside: HTMLElement, title: string) {
  return within(aside).getByRole("region", { name: title });
}

describe("사이드바 항목", () => {
  it("10개 항목을 받은 순서대로", async () => {
    const aside = await renderSidebar(full);
    expect(
      within(aside)
        .getAllByRole("heading")
        .map((heading) => heading.textContent),
    ).toEqual([
      "프로필",
      "최근 글",
      "최근 댓글",
      "인기 글",
      "태그",
      "보관함",
      "방문자",
      "검색",
      "피드",
    ]);
  });

  it("프로필: 주인 사진·닉네임·소개, 블로그 소개", async () => {
    const aside = await renderSidebar(full);
    const profile = section(aside, "프로필");
    expect(profile).toHaveTextContent("마르코");
    expect(profile).toHaveTextContent("백엔드 개발자");
    expect(profile).toHaveTextContent("자바와 스프링 이야기");
    expect(profile.querySelector("img.avatar")).not.toBeNull();
  });

  it("카테고리 트리", async () => {
    const aside = await renderSidebar(full);
    expect(within(aside).getByRole("navigation", { name: "카테고리" })).toHaveTextContent(
      "Spring (3)",
    );
  });

  it("최근 글·인기 글은 글 상세 링크", async () => {
    const aside = await renderSidebar(full);
    expect(within(section(aside, "최근 글")).getByRole("link", { name: "첫 글" })).toHaveAttribute(
      "href",
      "/marco/123",
    );
    expect(
      within(section(aside, "인기 글")).getByRole("link", { name: "인기 글 하나" }),
    ).toHaveAttribute("href", "/marco/7");
  });

  it("최근 댓글: 발췌·작성자, 비회원 표시, 댓글 위치 링크", async () => {
    const aside = await renderSidebar(full);
    const comments = section(aside, "최근 댓글");
    expect(within(comments).getByRole("link", { name: "좋은 글이네요" })).toHaveAttribute(
      "href",
      "/marco/123#comment-9",
    );
    expect(comments).toHaveTextContent("손님 (비회원)");
    expect(comments).not.toHaveTextContent("리더 (비회원)");
  });

  it("태그: 글 수에 따른 크기 단계와 블로그 태그 링크", async () => {
    const aside = await renderSidebar(full);
    const tags = section(aside, "태그");
    const spring = within(tags).getByRole("link", { name: /#spring/ });
    expect(spring).toHaveAttribute("href", "/marco/tags/spring");
    expect(spring.closest("li")).toHaveClass("tag-weight-5");
    expect(within(tags).getByRole("link", { name: /#jpa/ }).closest("li")).toHaveClass(
      "tag-weight-1",
    );
  });

  it.each([
    ["ko", "2026년 10월 (3)"],
    ["en", "October 2026 (3)"],
    ["ja", "2026年10月 (3)"],
    ["zh-CN", "2026年10月 (3)"],
  ] as const)("보관함(%s): 화면 언어 연·월과 그 달 링크", async (language, label) => {
    const aside = await renderSidebar(full, language);
    expect(within(aside).getByRole("link", { name: label })).toHaveAttribute(
      "href",
      "/marco/archive/2026/10",
    );
  });

  it("방문자: 오늘·어제·전체", async () => {
    const aside = await renderSidebar(full);
    const visitors = section(aside, "방문자");
    expect(visitors).toHaveTextContent("오늘12");
    expect(visitors).toHaveTextContent("어제30");
    expect(visitors).toHaveTextContent("전체1,520");
  });

  it("검색: JS 없이 GET /:handle/search", async () => {
    const aside = await renderSidebar(full);
    const form = within(aside).getByRole("search");
    expect(form).toHaveAttribute("method", "get");
    expect(form).toHaveAttribute("action", "/marco/search");
    expect(within(form).getByLabelText("이 블로그에서 검색")).toHaveAttribute("name", "q");
  });

  it("피드 링크: RSS·Atom", async () => {
    const aside = await renderSidebar(full);
    const feeds = section(aside, "피드");
    expect(within(feeds).getByRole("link", { name: "RSS" })).toHaveAttribute("href", "/marco/rss");
    expect(within(feeds).getByRole("link", { name: "Atom" })).toHaveAttribute(
      "href",
      "/marco/atom",
    );
  });

  it("빈 항목 안내(글·댓글·태그·보관함)", async () => {
    const aside = await renderSidebar({
      ...full,
      items: ["RECENT_POSTS", "RECENT_COMMENTS", "TAGS", "ARCHIVE"],
      recentPosts: [],
      recentComments: [],
      tags: [],
      archive: [],
    });
    expect(section(aside, "최근 글")).toHaveTextContent("아직 글이 없습니다.");
    expect(section(aside, "최근 댓글")).toHaveTextContent("아직 댓글이 없습니다.");
    expect(section(aside, "태그")).toHaveTextContent("아직 태그가 없습니다.");
    expect(section(aside, "보관함")).toHaveTextContent("아직 발행한 글이 없습니다.");
  });

  it("켰지만 데이터가 없는 항목(null)과 카테고리가 없는 블로그는 그리지 않는다", async () => {
    renderRoutes(
      [
        {
          path: ":handle",
          Component: () => (
            <Sidebar
              blog={{ ...sidebarBlog, categories: [] }}
              view={{
                items: [
                  "CATEGORIES",
                  "RECENT_POSTS",
                  "POPULAR_POSTS",
                  "RECENT_COMMENTS",
                  "TAGS",
                  "ARCHIVE",
                  "VISITORS",
                ],
                recentPosts: null,
                popularPosts: null,
                recentComments: null,
                tags: null,
                archive: null,
                visitors: null,
              }}
            />
          ),
        },
      ],
      { initialEntries: ["/marco"] },
    );
    const aside = await screen.findByRole("complementary");
    expect(within(aside).queryAllByRole("heading")).toHaveLength(0);
    expect(within(aside).queryByRole("navigation")).toBeNull();
  });
});
