import type { TopicNode } from "~/api/models";
import { findTopicById, topicName } from "~/portal/topics";

/** 주제 id를 "대분류 › 소분류"(화면 언어)로. 모르는 주제(숨김 등)면 `#id` */
export function topicLabel(tree: TopicNode[], id: number, language: string): string {
  const found = findTopicById(tree, id);
  if (!found) {
    return `#${id}`;
  }
  const name = topicName(found.topic.names, language);
  return found.parent ? `${topicName(found.parent.names, language)} › ${name}` : name;
}
