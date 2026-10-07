import { describe, expect, it } from "vitest";

import type { TopicNode } from "~/api/models";
import { DEFAULT_CARD_COLOR, cardColor } from "~/portal/cardColor";
import {
  findTopicById,
  findTopicBySlug,
  resolveTopicPath,
  tabTopics,
  topicGroups,
  topicHref,
  topicName,
} from "~/portal/topics";

import { topicNode } from "../support/fixtures";

const it_ = topicNode(12, "it-internet", { parentId: 5, onTab: true });
const mobile = topicNode(13, "mobile", { parentId: 5, cardColor: "#112233" });
const daily = topicNode(21, "daily", { parentId: 1 });
const tree: TopicNode[] = [
  topicNode(1, "life", { cardColor: "#F2A541" }, [daily]),
  topicNode(5, "knowledge", { cardColor: "#3D7DD8", onTab: true }, [it_, mobile]),
  topicNode(9, "empty", { cardColor: "bad" }),
];

/** 주제 도우미(003 T013) */
describe("topicName", () => {
  it("화면 언어 이름, 없거나 비면 en → ko", () => {
    expect(topicName(tree[0].names, "ja")).toBe("life ja");
    expect(topicName({ ...tree[0].names, ja: " " }, "ja")).toBe("life en");
    expect(topicName({ ...tree[0].names, ja: "", en: "" }, "ja")).toBe("life 한");
    expect(topicName(tree[0].names, "fr")).toBe("life en");
    expect(topicName(undefined, "ko")).toBe("");
    expect(topicName({ ko: "", en: "", ja: "", "zh-CN": "" }, "ko")).toBe("");
  });
});

describe("주제 찾기", () => {
  it("slug·id로 찾고 소분류는 부모를 함께", () => {
    expect(findTopicBySlug(tree, "life")).toEqual({ topic: tree[0], parent: null });
    expect(findTopicBySlug(tree, "mobile")).toEqual({ topic: mobile, parent: tree[1] });
    expect(findTopicBySlug(tree, "nope")).toBeNull();
    expect(findTopicById(tree, 21)).toEqual({ topic: daily, parent: tree[0] });
    expect(findTopicById(tree, 5)?.parent).toBeNull();
    expect(findTopicById(tree, 999)).toBeNull();
    expect(findTopicById(tree, null)).toBeNull();
  });

  it("주소의 대분류·소분류: 부모가 다르거나 대분류 자리의 소분류는 null", () => {
    expect(resolveTopicPath(tree, "knowledge")?.topic.id).toBe(5);
    expect(resolveTopicPath(tree, "knowledge", "mobile")?.topic.id).toBe(13);
    expect(resolveTopicPath(tree, "life", "mobile")).toBeNull();
    expect(resolveTopicPath(tree, "mobile")).toBeNull();
    expect(resolveTopicPath(tree, "nope")).toBeNull();
    expect(resolveTopicPath(tree, undefined)).toBeNull();
  });

  it("주제 페이지 주소", () => {
    expect(topicHref({ topic: tree[1], parent: null })).toBe("/topics/knowledge");
    expect(topicHref({ topic: mobile, parent: tree[1] })).toBe("/topics/knowledge/mobile");
  });

  it("탭은 onTab 대분류만, 발행 설정 그룹은 소분류가 있는 대분류만", () => {
    expect(tabTopics(tree).map((t) => t.slug)).toEqual(["knowledge"]);
    expect(topicGroups(tree).map((g) => [g.major.slug, g.minors.map((m) => m.slug)])).toEqual([
      ["life", ["daily"]],
      ["knowledge", ["it-internet", "mobile"]],
    ]);
  });
});

describe("cardColor", () => {
  it("소분류 색 → 대분류 색 → 기본 회색", () => {
    expect(cardColor(tree, 13)).toBe("#112233");
    expect(cardColor(tree, 12)).toBe("#3D7DD8");
    expect(cardColor(tree, 1)).toBe("#F2A541");
    expect(cardColor(tree, 9)).toBe(DEFAULT_CARD_COLOR);
    expect(cardColor(tree, null)).toBe(DEFAULT_CARD_COLOR);
    expect(cardColor(tree, 404)).toBe(DEFAULT_CARD_COLOR);
  });
});
