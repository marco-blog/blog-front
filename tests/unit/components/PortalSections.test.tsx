// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LatestBatch } from "~/components/portal/LatestPosts";
import { LatestPosts } from "~/components/portal/LatestPosts";
import { CurationSection } from "~/components/portal/CurationSection";
import { EmptyPortal } from "~/components/portal/EmptyPortal";
import { NewBlogs } from "~/components/portal/NewBlogs";
import { PopularPosts } from "~/components/portal/PopularPosts";
import { PopularTags } from "~/components/portal/PopularTags";
import { TopicTabs } from "~/components/portal/TopicTabs";
import { latestFetchHref, latestHref } from "~/portal/cursor";

import { portalCard, topicNode } from "../support/fixtures";
import { renderRoutes } from "../support/render";

const NOW = "2026-10-06T07:24:19Z";
const topics = [topicNode(1, "life", { onTab: false }), topicNode(5, "knowledge", { onTab: true })];

function renderUi(ui: React.ReactNode, language: "ko" | "en" = "ko") {
  return renderRoutes([{ index: true, Component: () => <>{ui}</> }], { language });
}

/** 포털 메인 영역(003 T043) */
describe("빈 영역은 그리지 않는다", () => {
  it.each([
    ["추천", <CurationSection key="c" cards={[]} topics={topics} now={NOW} />],
    ["인기", <PopularPosts key="p" cards={[]} topics={topics} now={NOW} />],
    ["탭", <TopicTabs key="t" topics={[topicNode(1, "life")]} />],
    ["태그", <PopularTags key="g" tags={[]} />],
    ["새 블로그", <NewBlogs key="n" blogs={[]} now={NOW} />],
    [
      "최신",
      <LatestPosts
        key="l"
        initial={{ cursor: null, items: [], nextCursor: null }}
        topics={topics}
        now={NOW}
      />,
    ],
  ])("%s", async (_, ui) => {
    renderUi(
      <>
        <p>바탕</p>
        {ui}
      </>,
    );
    expect(await screen.findByText("바탕")).toBeInTheDocument();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("영역 내용", () => {
  it("추천·인기는 제목과 카드 목록", async () => {
    renderUi(
      <>
        <CurationSection cards={[portalCard(1)]} topics={topics} now={NOW} />
        <PopularPosts cards={[portalCard(2), portalCard(3)]} topics={topics} now={NOW} />
      </>,
    );
    const curations = await screen.findByRole("region", { name: "운영자 추천" });
    expect(within(curations).getAllByRole("article")).toHaveLength(1);
    const popular = screen.getByRole("region", { name: "인기 글" });
    expect(within(popular).getAllByRole("article")).toHaveLength(2);
  });

  it("주제 탭은 onTab 대분류만, 화면 언어 이름, /topics/{slug}", async () => {
    renderUi(<TopicTabs topics={topics} />, "en");
    const nav = await screen.findByRole("navigation", { name: "Topics" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["knowledge en", "/topics/knowledge"],
    ]);
  });

  it("인기 태그의 글 수는 복수형 문구(en: 1 post, 2 posts)", async () => {
    renderUi(
      <PopularTags
        tags={[
          { name: "java", postCount: 1 },
          { name: "spring", postCount: 2 },
        ]}
      />,
      "en",
    );

    const items = within(await screen.findByRole("region", { name: "Popular tags" })).getAllByRole(
      "listitem",
    );
    expect(items[0]).toHaveTextContent("#java 1 post");
    expect(items[1]).toHaveTextContent("#spring 2 posts");
  });

  it("인기 태그는 /tags/{name}, 새 블로그는 블로그 홈 링크와 상대 시각", async () => {
    renderUi(
      <>
        <PopularTags tags={[{ name: "spring boot", postCount: 1400 }]} />
        <NewBlogs
          blogs={[
            {
              handle: "marco",
              title: "마르코의 블로그",
              description: "소개",
              coverImageUrl: "/media/cover00000000000000000",
              owner: { nickname: "마르코", profileImageUrl: null },
              firstPublishedAt: "2026-10-05T07:24:19Z",
            },
          ]}
          now={NOW}
        />
      </>,
    );
    const tags = await screen.findByRole("region", { name: "인기 태그" });
    expect(within(tags).getByRole("link", { name: "#spring boot" })).toHaveAttribute(
      "href",
      "/tags/spring%20boot",
    );
    expect(tags).toHaveTextContent("글 1,400개");
    const blogs = screen.getByRole("region", { name: "새로 시작한 블로그" });
    expect(within(blogs).getByRole("link", { name: "마르코의 블로그" })).toHaveAttribute(
      "href",
      "/marco",
    );
    expect(blogs).toHaveTextContent("소개");
    expect(blogs).toHaveTextContent("1일 전 시작");
  });

  it("빈 포털: 로그인이면 /write, 아니면 /signup", async () => {
    renderUi(<EmptyPortal loggedIn />);
    expect(await screen.findByRole("link", { name: "첫 글을 써 보세요" })).toHaveAttribute(
      "href",
      "/write",
    );
  });

  it("빈 포털 비로그인", async () => {
    renderUi(<EmptyPortal loggedIn={false} />);
    expect(await screen.findByRole("link", { name: "가입하고 첫 글을 써 보세요" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});

describe("LatestPosts 더 보기", () => {
  const first: LatestBatch = {
    cursor: null,
    items: [portalCard(30), portalCard(29)],
    nextCursor: "c1",
  };

  it("JS 없이도 /?cursor= 링크, 다음 커서가 없으면 버튼 없음", async () => {
    renderUi(<LatestPosts initial={first} topics={topics} now={NOW} />);
    const region = await screen.findByRole("region", { name: "최신 글" });
    expect(within(region).getByRole("link", { name: "더 보기" })).toHaveAttribute(
      "href",
      latestHref("c1"),
    );
    expect(latestHref("a/b+c")).toBe("/?cursor=a%2Fb%2Bc");
    expect(latestFetchHref("c1")).toBe("/?index&cursor=c1");
  });

  it("마지막 묶음이면 버튼이 없다", async () => {
    renderUi(<LatestPosts initial={{ ...first, nextCursor: null }} topics={topics} now={NOW} />);
    const region = await screen.findByRole("region", { name: "최신 글" });
    expect(within(region).queryByRole("link", { name: "더 보기" })).toBeNull();
  });

  it("JS가 있으면 fetcher로 다음 묶음을 받아 이어 붙이고, 그 묶음의 커서로 버튼을 바꾼다", async () => {
    const batches: Record<string, LatestBatch> = {
      c1: { cursor: "c1", items: [portalCard(28), portalCard(27)], nextCursor: "c2" },
      c2: { cursor: "c2", items: [portalCard(26)], nextCursor: null },
    };
    renderRoutes(
      [
        {
          index: true,
          loader: ({ request }) => {
            const cursor = new URL(request.url).searchParams.get("cursor");
            return { cursorBatch: cursor ? batches[cursor] : null };
          },
          Component: () => <LatestPosts initial={first} topics={topics} now={NOW} />,
        },
      ],
      {},
    );

    const region = await screen.findByRole("region", { name: "최신 글" });
    fireEvent.click(within(region).getByRole("link", { name: "더 보기" }));
    expect(await within(region).findByText("포털 글 27")).toBeInTheDocument();
    expect(within(region).getAllByRole("article")).toHaveLength(4);

    fireEvent.click(within(region).getByRole("link", { name: "더 보기" }));
    expect(await within(region).findByText("포털 글 26")).toBeInTheDocument();
    expect(within(region).getAllByRole("article")).toHaveLength(5);
    expect(within(region).queryByRole("link", { name: "더 보기" })).toBeNull();
  });
});
