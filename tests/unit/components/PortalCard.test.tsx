// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PortalCard as PortalCardData } from "~/api/models";
import { PortalCard } from "~/components/portal/PortalCard";
import type { Language } from "~/i18n/config";
import { DEFAULT_CARD_COLOR } from "~/portal/cardColor";

import { portalCard, topicNode } from "../support/fixtures";
import { renderRoutes } from "../support/render";

const NOW = "2026-10-06T07:24:19Z";
const topics = [
  topicNode(5, "knowledge", { cardColor: "#3D7DD8", onTab: true }, [
    topicNode(12, "it-internet", { parentId: 5 }),
  ]),
];

function renderCard(card: PortalCardData, language: Language = "ko") {
  return renderRoutes(
    [{ index: true, Component: () => <PortalCard card={card} topics={topics} now={NOW} /> }],
    { language },
  );
}

/** 포털 카드(003 T042, FR-085) */
describe("PortalCard", () => {
  it("대표 이미지(300x200, 2배 600x400)·제목·요약 2줄·블로그·작성자·상대 시각·좋아요·댓글, 카드 링크", async () => {
    renderCard(
      portalCard(123, {
        title: "Spring Boot 4 시작하기",
        thumbnailUrl: "/media/k3Jd9fQ2xLmA7pZ0bR5tYw",
        author: { nickname: "마르코", profileImageUrl: "/media/Ab3d9fQ2xLmA7pZ0bR5tYw" },
        likeCount: 1234,
        commentCount: 2,
      }),
    );

    const article = await screen.findByRole("article");
    const link = within(article).getByRole("link", { name: /Spring Boot 4 시작하기/ });
    expect(link).toHaveAttribute("href", "/marco/123");
    const image = article.querySelector("img.portal-card-image");
    expect(image).toHaveAttribute("src", "/media/k3Jd9fQ2xLmA7pZ0bR5tYw/300x200");
    expect(image?.getAttribute("srcset")).toContain("/media/k3Jd9fQ2xLmA7pZ0bR5tYw/600x400 2x");
    const summary = within(article).getByText("요약 123");
    expect(summary).toHaveClass("portal-card-summary");
    expect(summary.style.webkitLineClamp).toBe("2");
    expect(within(article).getByRole("link", { name: "마르코의 블로그" })).toHaveAttribute(
      "href",
      "/marco",
    );
    expect(article).toHaveTextContent("마르코");
    expect(within(article).getByText("3시간 전")).toHaveAttribute(
      "dateTime",
      "2026-10-06T04:24:19Z",
    );
    expect(article).toHaveTextContent("좋아요 1,234");
    expect(article).toHaveTextContent("댓글 2");
  });

  it("대표 이미지가 없으면 주제 카드 색 기본 이미지와 주제 이름(화면 언어)", async () => {
    renderCard(portalCard(1, { topicId: 12 }), "en");

    const placeholder = await screen.findByTestId("portal-card-placeholder");
    expect(placeholder).toHaveStyle({ backgroundColor: "#3D7DD8" });
    expect(placeholder).toHaveTextContent("it-internet en");
    expect(screen.getByRole("article")).toHaveTextContent("3 likes");
  });

  it.each([
    ["en", 1, 1, "1 like", "1 comment"],
    ["en", 0, 2, "0 likes", "2 comments"],
    ["ko", 1, 1, "좋아요 1", "댓글 1"],
    ["ja", 1, 1, "いいね 1", "コメント 1"],
    ["zh-CN", 1, 1, "点赞 1", "评论 1"],
  ] as const)(
    "좋아요·댓글 수는 복수형 규칙을 따른다(%s %i/%i)",
    async (language, likes, comments, likeText, commentText) => {
      renderCard(portalCard(3, { likeCount: likes, commentCount: comments }), language);

      const article = await screen.findByRole("article");
      expect(article).toHaveTextContent(likeText);
      expect(article).toHaveTextContent(commentText);
      if (language === "en") {
        expect(article).not.toHaveTextContent("1 likes");
      }
    },
  );

  it("주제가 없으면 기본 회색과 '주제 없음', 요약이 없으면 요약 없음", async () => {
    renderCard(portalCard(2, { topicId: null, summary: null }), "ja");

    const placeholder = await screen.findByTestId("portal-card-placeholder");
    expect(placeholder).toHaveStyle({ backgroundColor: DEFAULT_CARD_COLOR });
    expect(placeholder).toHaveTextContent("トピックなし");
    expect(screen.getByRole("article").querySelector(".portal-card-summary")).toBeNull();
  });
});
