/**
 * 001 API의 result 형식(contracts/api.md). backend OpenAPI가 나오면 생성 타입(app/api/schema.d.ts)으로 바꾼다.
 * 지금은 backend와 병행 개발 중이라 계약 문서를 그대로 옮겨 적었다.
 */

export type Visibility = "PUBLIC" | "PRIVATE";
export type PostStatus = "DRAFT" | "PUBLISHED" | "DELETED";

export interface BlogRef {
  handle: string;
  title: string;
}

/** POST /auth/login */
export interface LoginResult {
  userId: number;
  nickname: string;
  role: string;
  blogs: BlogRef[];
}

/** POST /auth/signup */
export interface SignupResult {
  userId: number;
  handle: string;
}

/** GET /auth/handle-availability */
export type HandleUnavailableReason = "TAKEN" | "RESERVED" | "INVALID";
export interface HandleAvailability {
  available: boolean;
  reason?: HandleUnavailableReason | null;
}

/** GET /legal/terms, /legal/privacy */
export interface LegalDocument {
  version: string;
  lang: string;
  authoritativeLang: string;
  effectiveAt: string;
  contentHtml: string;
}

export interface CategoryNode {
  id: number;
  name: string;
  postCount: number;
  children: CategoryNode[];
}

/** 피드(RSS·Atom) 공개 형태(002 FR-046): 본문 전체 또는 요약 */
export type FeedContentMode = "FULL" | "SUMMARY";

/** GET /blogs/{handle}. 002가 구독자 수·구독 여부·피드 설정을 더했다(contracts/api.md "001 응답 확장"). */
export interface Blog {
  handle: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  commentEnabled: boolean;
  owner: { nickname: string; profileImageUrl: string | null; bio: string | null };
  categories: CategoryNode[];
  subscriberCount: number;
  /** 로그인 회원이 구독 중이면 true, 아니면 false, 비로그인이면 null */
  subscribedByMe: boolean | null;
  feedItemCount: 10 | 20 | 30 | 50;
  feedContentMode: FeedContentMode;
}

/** GET /me/blogs */
export interface MyBlog {
  handle: string;
  title: string;
  coverImageUrl: string | null;
  postCount: number;
  createdAt: string;
}
export interface MyBlogs {
  items: MyBlog[];
  count: number;
  limit: number;
}

export interface PostRef {
  id: number;
  title: string;
}

export interface PostSummary {
  id: number;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  category: { id: number; name: string } | null;
  tags: string[];
  viewCount: number;
  commentCount: number;
  visibility: Visibility;
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
  hasDraft: boolean;
  deletedAt?: string | null;
  purgeAt?: string | null;
}

export interface PostDetail {
  id: number;
  blogHandle: string;
  title: string;
  contentHtml: string;
  /** 주인에게만, 그 외 null */
  contentMarkdown: string | null;
  summary: string | null;
  thumbnailUrl: string | null;
  category: { id: number; name: string } | null;
  tags: string[];
  visibility: Visibility;
  status: PostStatus;
  viewCount: number;
  commentCount: number;
  commentEnabled: boolean;
  author: { nickname: string; profileImageUrl: string | null };
  prev: PostRef | null;
  next: PostRef | null;
  publishedAt: string | null;
  updatedAt: string;
  /** 좋아요 수(002 FR-030) */
  likeCount: number;
  /** 로그인 회원이 눌렀으면 true, 아니면 false, 비로그인이면 null */
  likedByMe: boolean | null;
}

/** 작성 화면의 내용(DraftWrite). 카테고리·태그는 US2에서 채운다. */
export interface DraftWrite {
  title: string;
  contentMarkdown: string;
  categoryId?: number | null;
  tags?: string[];
}

/** GET /posts/{id}/draft */
export interface DraftContent extends DraftWrite {
  savedAt: string | null;
}

/** POST /blogs/{handle}/posts/drafts, PUT /posts/{id}/draft */
export interface SavedDraft {
  id: number;
  savedAt: string;
}

/** GET /blogs/{handle}/posts/drafts/latest */
export interface LatestDraft {
  id: number;
  title: string;
  savedAt: string;
}

/** POST /posts/{id}/publish. `thumbnailMediaKey`는 본문 이미지 중 하나(생략하면 본문 첫 이미지) */
export interface PublishSettings {
  visibility: Visibility;
  commentEnabled: boolean;
  thumbnailMediaKey?: string | null;
  categoryId?: number | null;
  tags?: string[];
}

/** GET /me/login-history 한 줄(IP는 backend가 일부 가림) */
export interface LoginHistoryItem {
  at: string;
  success: boolean;
  ipMasked: string | null;
  device: string | null;
}

/** 댓글 작성자. 프로필 이미지가 없으면 profileImageUrl은 null */
export interface CommentAuthor {
  userId: number;
  nickname: string;
  profileImageUrl: string | null;
}

/**
 * GET /posts/{postId}/comments 한 줄(contracts/api.md `Comment`). 답글이 남은 채 삭제된 댓글은
 * `deleted: true`, `content: null`, `author: null`. 답글은 replies에 작성순(답글의 replies는 늘 빈 배열).
 */
export interface Comment {
  id: number;
  content: string | null;
  author: CommentAuthor | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  replies: Comment[];
}

/** POST /posts/{postId}/comments, PATCH /comments/{id}. 내용은 일반 텍스트 1~1000자 */
export interface CommentWrite {
  content: string;
  parentId?: number | null;
}

/** 댓글 내용 최대 길이(backend `Comment.CONTENT_MAX`) */
export const COMMENT_MAX_LENGTH = 1000;

/** 블로그 관리 댓글 목록·대시보드 최근 댓글(Comment + { postId, postTitle }) */
export interface ManageComment {
  id: number;
  content: string | null;
  author: CommentAuthor | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  postId: number;
  postTitle: string;
}

/** GET /blogs/{handle}/manage/dashboard. 방문자 수·방명록은 004가 더한다. */
export interface ManageDashboard {
  draftCount: number;
  recentPosts: PostSummary[];
  newComments7d: number;
  recentComments: ManageComment[];
}

/** POST /blogs/{handle}/manage/posts/bulk. `MOVE_CATEGORY`의 categoryId가 null이면 미분류로 옮긴다. */
export interface BulkPostRequest {
  postIds: number[];
  action: "CHANGE_VISIBILITY" | "DELETE" | "MOVE_CATEGORY";
  visibility?: Visibility;
  categoryId?: number | null;
}
export interface BulkPostResult {
  updated: number;
}

/** GET /tags/{name}/posts: 서비스 전체 태그별 글(PostSummary + 블로그 주소) */
export type TaggedPostSummary = PostSummary & { blogHandle: string };

/** GET /blogs/{handle}/tags */
export interface BlogTag {
  name: string;
  postCount: number;
}

/** POST /blogs/{handle}/categories */
export interface CreateCategoryRequest {
  name: string;
  parentId: number | null;
}

/** PUT /blogs/{handle}/categories/order의 항목 */
export interface CategoryOrderItem {
  id: number;
  parentId: number | null;
  sortOrder: number;
}

/** 이미지 용도(POST /media `purpose`). 프로필·블로그 대표 이미지는 그 용도로 올린 이미지만 저장할 수 있다. */
export type MediaPurpose = "POST" | "PROFILE" | "BLOG_COVER";

/** POST /media 201 */
export interface MediaUpload {
  key: string;
  /** `/media/{key}` */
  url: string;
  mime: string;
  size: number;
  width: number;
  height: number;
}

/** PUT·DELETE /me/likes/{postId}(002 FR-030) */
export interface LikeState {
  postId: number;
  liked: boolean;
  likeCount: number;
}

/** PUT·DELETE /me/subscriptions/{handle}(002 FR-031) */
export interface SubscriptionState {
  handle: string;
  subscribed: boolean;
  subscriberCount: number;
}

/** GET /me/feed 한 줄: PostSummary + 블로그·작성자. `hasDraft`는 늘 false */
export type FeedPost = PostSummary & {
  blog: BlogRef;
  author: { nickname: string; profileImageUrl: string | null };
};

/** GET /search/posts 한 줄: PostSummary + 블로그 */
export type SearchPost = PostSummary & { blog: BlogRef };

/** 002가 만드는 알림 종류. 이후 스펙이 더하므로 응답의 `type`은 string으로 받는다(모르는 값은 공통 문구). */
export const NOTIFICATION_TYPES = ["NEW_COMMENT", "NEW_SUBSCRIBER"] as const;
export type KnownNotificationType = (typeof NOTIFICATION_TYPES)[number];

/** GET /me/notifications 한 줄(contracts/api.md `Notification`) */
export interface Notification {
  id: number;
  type: string;
  /** 알림을 일으킨 회원. 비회원·시스템이면 null, 탈퇴 회원이면 닉네임·프로필 없이 withdrawn: true */
  actor: {
    userId: number;
    nickname: string | null;
    profileImageUrl: string | null;
    withdrawn: boolean;
  } | null;
  blog: BlogRef | null;
  targetType: string | null;
  targetId: number | null;
  /** 만들 때 저장한 값(번역하지 않음). NEW_COMMENT { postId, postTitle }, NEW_SUBSCRIBER { blogTitle } */
  params: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

/** POST /me/notifications/bulk */
export interface BulkNotificationRequest {
  action: "MARK_READ";
  ids?: number[];
}
export interface BulkNotificationResult {
  updated: number;
}
