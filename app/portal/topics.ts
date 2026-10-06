import type { TopicNames, TopicNode } from "~/api/models";
import { FALLBACK_LANGUAGES, isSupportedLanguage } from "~/i18n/config";

/**
 * 주제 트리 도우미(003 research P2·P7, 결정 표 8번). `GET /topics`가 4개 언어 이름을 모두 주고 화면 언어로 고른다.
 * 트리는 대분류 → 소분류 2단계다.
 */

/** 화면 언어의 이름. 없거나 비었으면 en → ko 순으로 대체한다. */
export function topicName(names: TopicNames | undefined, language: string): string {
  if (!names) {
    return "";
  }
  const order = [isSupportedLanguage(language) ? language : null, ...FALLBACK_LANGUAGES];
  for (const candidate of order) {
    const name = candidate ? names[candidate]?.trim() : undefined;
    if (name) {
      return name;
    }
  }
  return "";
}

export interface FoundTopic {
  topic: TopicNode;
  /** 소분류면 대분류, 대분류면 null */
  parent: TopicNode | null;
}

/** slug(서비스 전체 유일)로 찾는다. */
export function findTopicBySlug(tree: TopicNode[], slug: string): FoundTopic | null {
  for (const major of tree) {
    if (major.slug === slug) {
      return { topic: major, parent: null };
    }
    const minor = major.children.find((child) => child.slug === slug);
    if (minor) {
      return { topic: minor, parent: major };
    }
  }
  return null;
}

/** id로 찾는다. */
export function findTopicById(tree: TopicNode[], id: number | null | undefined): FoundTopic | null {
  if (id === null || id === undefined) {
    return null;
  }
  for (const major of tree) {
    if (major.id === id) {
      return { topic: major, parent: null };
    }
    const minor = major.children.find((child) => child.id === id);
    if (minor) {
      return { topic: minor, parent: major };
    }
  }
  return null;
}

/**
 * 주소 `/topics/:major/:minor?`의 주제. 대분류 자리에 대분류, 소분류 자리에 그 대분류의 소분류가 있어야 한다
 * (대분류 자리의 소분류, 부모가 다른 소분류는 null → 404).
 */
export function resolveTopicPath(
  tree: TopicNode[],
  majorSlug: string | undefined,
  minorSlug?: string,
): FoundTopic | null {
  if (!majorSlug) {
    return null;
  }
  const major = findTopicBySlug(tree, majorSlug);
  if (!major || major.parent !== null) {
    return null;
  }
  if (minorSlug === undefined) {
    return major;
  }
  const minor = major.topic.children.find((child) => child.slug === minorSlug);
  return minor ? { topic: minor, parent: major.topic } : null;
}

/** 주제 페이지 주소 */
export function topicHref(found: FoundTopic): string {
  return found.parent
    ? `/topics/${found.parent.slug}/${found.topic.slug}`
    : `/topics/${found.topic.slug}`;
}

/** 메인 주제 탭: `onTab`인 대분류 */
export function tabTopics(tree: TopicNode[]): TopicNode[] {
  return tree.filter((major) => major.onTab);
}

export interface TopicGroup {
  major: TopicNode;
  minors: TopicNode[];
}

/** 발행 설정용: 대분류별로 묶은 소분류(소분류가 없는 대분류는 빠진다) */
export function topicGroups(tree: TopicNode[]): TopicGroup[] {
  return tree
    .filter((major) => major.children.length > 0)
    .map((major) => ({ major, minors: major.children }));
}
