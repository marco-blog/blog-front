import type { Blog, PortalCard, PostDetail, PostSummary, TopicNode } from "~/api/models";

/** contracts/api.md 형식의 예시 데이터 */
export const blog: Blog = {
  handle: "marco",
  title: "마르코의 블로그",
  description: "자바와 스프링 이야기",
  coverImageUrl: "/media/cover00000000000000000",
  commentEnabled: true,
  owner: { nickname: "마르코", profileImageUrl: null, bio: null },
  categories: [{ id: 12, name: "Spring", postCount: 3, children: [] }],
  subscriberCount: 3,
  subscribedByMe: null,
  feedItemCount: 20,
  feedContentMode: "FULL",
};

export function postSummary(id: number, overrides: Partial<PostSummary> = {}): PostSummary {
  return {
    id,
    title: `글 ${id}`,
    summary: `요약 ${id}`,
    thumbnailUrl: null,
    category: null,
    tags: [],
    viewCount: id * 10,
    commentCount: 0,
    visibility: "PUBLIC",
    status: "PUBLISHED",
    publishedAt: "2026-10-06T04:24:19Z",
    updatedAt: "2026-10-06T04:24:19Z",
    hasDraft: false,
    ...overrides,
  };
}

export const postDetail: PostDetail = {
  id: 123,
  blogHandle: "marco",
  title: "JPA N+1 정리",
  contentHtml: '<p>본문입니다.</p><pre><code class="language-java">public class A {}</code></pre>',
  contentMarkdown: null,
  summary: "N+1 문제를 정리한다",
  thumbnailUrl: "/media/k3Jd9fQ2xLmA7pZ0bR5tYw",
  category: { id: 12, name: "Spring" },
  tags: ["jpa", "spring"],
  visibility: "PUBLIC",
  status: "PUBLISHED",
  viewCount: 10,
  commentCount: 2,
  commentEnabled: true,
  author: { nickname: "마르코", profileImageUrl: null },
  prev: { id: 122, title: "이전 글 제목" },
  next: null,
  publishedAt: "2026-10-06T04:24:19Z",
  updatedAt: "2026-10-06T05:00:00Z",
  likeCount: 5,
  likedByMe: null,
};

/** 글 상세 loader가 화면에 넘기는 형태(본문 원문 제외) */
export function postWithoutMarkdown(): Omit<PostDetail, "contentMarkdown"> {
  const copy: Partial<PostDetail> = { ...postDetail };
  delete copy.contentMarkdown;
  return copy as Omit<PostDetail, "contentMarkdown">;
}

/** 003 주제 노드. 이름은 slug로 4개 언어를 채운다. */
export function topicNode(
  id: number,
  slug: string,
  overrides: Partial<TopicNode> = {},
  children: TopicNode[] = [],
): TopicNode {
  return {
    id,
    slug,
    parentId: null,
    names: { ko: `${slug} 한`, en: `${slug} en`, ja: `${slug} ja`, "zh-CN": `${slug} zh` },
    cardColor: null,
    onTab: false,
    children,
    ...overrides,
  };
}

/** 003 포털 카드 */
export function portalCard(id: number, overrides: Partial<PortalCard> = {}): PortalCard {
  return {
    id,
    source: "INTERNAL",
    title: `포털 글 ${id}`,
    summary: `요약 ${id}`,
    thumbnailUrl: null,
    topicId: null,
    blog: { handle: "marco", title: "마르코의 블로그" },
    author: { nickname: "마르코", profileImageUrl: null },
    externalBlog: null,
    visitUrl: null,
    publishedAt: "2026-10-06T04:24:19Z",
    likeCount: 3,
    commentCount: 2,
    ...overrides,
  };
}
