import type { TopicNode } from "~/api/models";

import { findTopicById } from "./topics";

/** 주제가 없거나 색을 정하지 않은 대분류의 기본 카드 색(003 research P7) */
export const DEFAULT_CARD_COLOR = "#9AA0A6";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** 카드 기본 이미지 색: 소분류 색 → 대분류 색 → 기본 회색 */
export function cardColor(tree: TopicNode[], topicId: number | null | undefined): string {
  const found = findTopicById(tree, topicId);
  const color = found?.topic.cardColor ?? found?.parent?.cardColor ?? null;
  return color && HEX_COLOR.test(color) ? color : DEFAULT_CARD_COLOR;
}
