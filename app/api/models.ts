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

/** GET /blogs/{handle} */
export interface Blog {
  handle: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  commentEnabled: boolean;
  owner: { nickname: string; profileImageUrl: string | null; bio: string | null };
  categories: CategoryNode[];
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

/** POST /posts/{id}/publish. 대표 이미지는 US4, 카테고리·태그는 US2에서 더한다. */
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

/** 댓글 작성자. 프로필 이미지는 US4 전까지 null */
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
