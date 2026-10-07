/**
 * 001 API의 result 형식(contracts/api.md). backend OpenAPI가 나오면 생성 타입(app/api/schema.d.ts)으로 바꾼다.
 * 지금은 backend와 병행 개발 중이라 계약 문서를 그대로 옮겨 적었다.
 */

/** 004가 보호 글(`PROTECTED`, FR-062)과 예약 글(`SCHEDULED`, FR-064)을 더했다. */
export type Visibility = "PUBLIC" | "PRIVATE" | "PROTECTED";
export type PostStatus = "DRAFT" | "PUBLISHED" | "DELETED" | "SCHEDULED";

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
  /** "포털에 내 글 노출"(003 FR-089, 기본 true) */
  portalEnabled?: boolean;
  /** 블로그 기본 주제(소분류, 003 FR-077) */
  defaultTopicId?: number | null;
  /** 방명록 사용(004 FR-058, 기본 true) */
  guestbookEnabled?: boolean;
  /** 비회원 댓글·방명록 허용(004 FR-066, 기본 false) */
  guestWriteEnabled?: boolean;
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
  /** 공지(004 FR-059) */
  notice?: boolean;
  /** 예약 시각(004 FR-064). 관리 목록에서만 값 */
  scheduledAt?: string | null;
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
  /** 글의 주제(소분류, 003). 이름은 GET /topics 트리로 찾는다 */
  topicId?: number | null;
  /** 열지 않은 보호 글(004 FR-062). true면 본문·요약·대표 이미지·카테고리·주제가 null, 태그는 [] */
  locked?: boolean;
  /** 공지(004 FR-059) */
  notice?: boolean;
  /** 예약 시각(004 FR-064). 주인에게만 값 */
  scheduledAt?: string | null;
}

/** 작성 화면의 내용(DraftWrite). 카테고리·태그는 US2에서 채운다. */
export interface DraftWrite {
  title: string;
  contentMarkdown: string;
  categoryId?: number | null;
  tags?: string[];
  /** 작성 중 주제(소분류, 003). 저장 때는 검증하지 않는다 */
  topicId?: number | null;
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
  /** 값이 있으면 그 주제, null·생략이면 작성 중 사본의 값(003) */
  topicId?: number | null;
  /** 보호 글 비밀번호(004, 4~64자). 이미 보호 글이면 생략해 기존 값 유지 */
  password?: string;
  /** 예약 시각(004, UTC ISO). null·생략·지금 이하면 바로 발행 */
  scheduledAt?: string | null;
  /** 공지(004). null·생략이면 지금 값 유지 */
  notice?: boolean | null;
}

/** GET /me/login-history 한 줄(IP는 backend가 일부 가림) */
export interface LoginHistoryItem {
  at: string;
  success: boolean;
  ipMasked: string | null;
  device: string | null;
}

/**
 * 댓글·방명록 작성자. 프로필 이미지가 없으면 profileImageUrl은 null.
 * 비회원(004 FR-066)은 `{ userId: null, nickname: 이름, profileImageUrl: null, guest: true }`
 */
export interface CommentAuthor {
  userId: number | null;
  nickname: string;
  profileImageUrl: string | null;
  guest?: boolean;
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
  /** 비밀 댓글(004 FR-065). 볼 수 없으면 content가 null */
  secret?: boolean;
  createdAt: string;
  updatedAt: string;
  replies: Comment[];
}

/** POST /posts/{postId}/comments, PATCH /comments/{id}. 내용은 일반 텍스트 1~1000자 */
export interface CommentWrite {
  content: string;
  parentId?: number | null;
  /** 비밀 댓글(004 FR-065). 글 주인·작성자만 내용을 본다 */
  secret?: boolean;
  /** 비회원 쓰기(004 FR-066): 블로그가 허용하고 비로그인일 때 */
  guestName?: string;
  guestPassword?: string;
}

/** 댓글 내용 최대 길이(backend `Comment.CONTENT_MAX`) */
export const COMMENT_MAX_LENGTH = 1000;

/** 블로그 관리 댓글 목록·대시보드 최근 댓글(Comment + { postId, postTitle }) */
export interface ManageComment {
  id: number;
  content: string | null;
  author: CommentAuthor | null;
  deleted: boolean;
  /** 비밀 댓글(004). 주인에게는 내용이 온다 */
  secret?: boolean;
  createdAt: string;
  updatedAt: string;
  postId: number;
  postTitle: string;
}

/** GET /blogs/{handle}/manage/dashboard. 방문자 수·방명록은 004가 더했다. */
export interface ManageDashboard {
  draftCount: number;
  recentPosts: PostSummary[];
  newComments7d: number;
  recentComments: ManageComment[];
  /** 004 FR-067 */
  visitors?: VisitorCounts;
  /** 최근 7일 새 방명록 수(004) */
  newGuestbook7d?: number;
  /** 최근 방명록 5건(답글 제외, 004) */
  recentGuestbook?: GuestbookEntry[];
}

/** POST /blogs/{handle}/manage/posts/bulk. `MOVE_CATEGORY`의 categoryId가 null이면 미분류로 옮긴다. 004가 공지 지정·해제를 더했다. */
export interface BulkPostRequest {
  postIds: number[];
  action: "CHANGE_VISIBILITY" | "DELETE" | "MOVE_CATEGORY" | "NOTICE" | "UNNOTICE";
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

/**
 * 004 백업 준비 알림(target `BLOG_EXPORT`, params `{ blogTitle, handle, expiresAt }`). 문구에 블로그 제목과 내려받을 수 있는
 * 마지막 시각을 넣고, 누르면 그 블로그의 백업 화면(`/{handle}/manage/backup`)으로 간다.
 */
export const BACKUP_READY_NOTIFICATION = "BACKUP_READY";
/** 아는 알림 종류(002 댓글·구독, 004 백업). 이후 스펙이 더하므로 응답의 `type`은 string으로 받는다(모르는 값은 공통 문구). */
export const NOTIFICATION_TYPES = [
  "NEW_COMMENT",
  "NEW_SUBSCRIBER",
  BACKUP_READY_NOTIFICATION,
] as const;
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
  /**
   * 만들 때 저장한 값(번역하지 않음). NEW_COMMENT { postId, postTitle }, NEW_SUBSCRIBER { blogTitle },
   * BACKUP_READY { blogTitle, handle, expiresAt }
   */
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

// ---- 003 포털(003 contracts/api.md) ----

/** 화면 언어별 이름(4개 언어 모두 온다) */
export type TopicNames = Record<"ko" | "en" | "ja" | "zh-CN", string>;

/** GET /topics: 대분류 순서대로, 각 children은 소분류 순서대로(소분류의 children은 늘 []) */
export interface TopicNode {
  id: number;
  slug: string;
  /** 대분류면 null(응답에서 빠질 수 있다) */
  parentId?: number | null;
  names: TopicNames;
  /** `#RRGGBB`. 소분류가 null이면 대분류 색을 쓴다 */
  cardColor?: string | null;
  /** 주제 탭에 보이는지(FR-147 자동 숨김 계산) */
  onTab: boolean;
  children: TopicNode[];
}

/** 포털 카드(FR-085) */
export interface PortalCard {
  id: number;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  topicId: number | null;
  blog: BlogRef;
  author: { nickname: string; profileImageUrl: string | null };
  publishedAt: string;
  likeCount: number;
  commentCount: number;
}

export interface PopularTag {
  name: string;
  postCount: number;
}

export interface NewBlog {
  handle: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  owner: { nickname: string; profileImageUrl: string | null };
  firstPublishedAt: string;
}

/** GET /portal. 빈 영역은 []. `latest.nextCursor`가 없으면(null·생략) 더 없음 */
export interface PortalHome {
  curations: PortalCard[];
  popular: PortalCard[];
  latest: { items: PortalCard[]; nextCursor?: string | null };
  popularTags: PopularTag[];
  newBlogs: NewBlog[];
  generatedAt: string;
}

export interface UserRef {
  userId: number;
  nickname: string;
}

/** GET /admin/topics: TopicNode + 관리 정보 */
export interface AdminTopicNode extends Omit<TopicNode, "children"> {
  adminHidden: boolean;
  effectiveHidden: boolean;
  pinnedOnTab: boolean;
  recentPostCount: number;
  createdAt: string;
  updatedAt: string;
  children: AdminTopicNode[];
}

export type CurationStatus = "ACTIVE" | "UPCOMING" | "ENDED";

export interface Curation {
  id: number;
  post: { id: number; title: string; blogHandle: string };
  startsAt: string;
  endsAt: string;
  sortOrder: number;
  status: CurationStatus;
  portalEligible: boolean;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

export interface Exclusion {
  post: { id: number; title: string; blogHandle: string };
  reason: string;
  excludedBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/portal/posts/{id} */
export interface AdminPortalPost {
  id: number;
  title: string;
  blog: BlogRef;
  status: PostStatus;
  visibility: Visibility;
  publishedAt: string | null;
  portalEligible: boolean;
  ineligibleReasons: string[];
  excluded: { reason: string; excludedBy: UserRef; createdAt: string } | null;
}

/** 인기 점수 가중치(설정 `portal.score-weights`) */
export interface ScoreWeights {
  view: number;
  readComplete: number;
  like: number;
  comment: number;
  halfLifeHours: number;
  reportPenalty: number;
}

/** GET /admin/settings 한 줄 */
export interface Setting {
  key: string;
  value: unknown;
  defaultValue: unknown;
  overridden: boolean;
  updatedBy: UserRef | null;
  updatedAt: string | null;
}

/** 릴리스 노트 요약(GET /release-notes, 001 contracts) */
export interface ReleaseNoteSummary {
  version: string;
  title: string;
  releaseDate: string;
  firstPublishedAt: string;
  lang: string;
}

/** GET /release-notes */
export interface ReleaseNoteList {
  items: ReleaseNoteSummary[];
  portalCard: ReleaseNoteSummary | null;
}

export interface ReleaseNoteTocEntry {
  level: number;
  text: string;
  anchor: string;
}

/** GET /release-notes/{version} */
export interface ReleaseNoteDetail {
  version: string;
  releaseDate: string;
  firstPublishedAt: string;
  updatedAt: string;
  requestedLang: string;
  lang: string;
  title: string;
  contentHtml: string;
  toc: ReleaseNoteTocEntry[];
  prev: { version: string; title: string } | null;
  next: { version: string; title: string } | null;
  revisionCount: number;
  /** 수정본 보기(GET .../revisions/{revisionNo})일 때만 */
  revisionNo?: number;
}

/** GET /release-notes/search 한 줄 */
export interface ReleaseNoteSearchHit {
  version: string;
  title: string;
  snippet: string;
  releaseDate: string;
  lang: string;
}

/** GET /release-notes/{version}/revisions 한 줄 */
export interface ReleaseNoteRevision {
  revisionNo: number;
  editedAt: string;
}

// ---- 004 블로그 꾸미기와 글 옵션(004 contracts/api.md) ----

/** 방명록 글(GET /blogs/{handle}/guestbook). 비밀글은 주인·작성 회원 외에 content가 null, 삭제된 자리는 author도 null */
export interface GuestbookEntry {
  id: number;
  content: string | null;
  secret: boolean;
  deleted: boolean;
  author: CommentAuthor | null;
  createdAt: string;
  updatedAt: string;
  replies: GuestbookEntry[];
}

/** POST /blogs/{handle}/guestbook. 비로그인(비회원 허용 블로그)만 guestName·guestPassword */
export interface GuestbookWrite {
  content: string;
  secret?: boolean;
  parentId?: number | null;
  guestName?: string;
  guestPassword?: string;
}

/** 방명록·비회원 글 길이 제한(backend와 같다) */
export const GUESTBOOK_MAX_LENGTH = 1000;
export const GUEST_NAME_MAX = 30;
export const GUEST_PASSWORD_MIN = 4;
export const GUEST_PASSWORD_MAX = 64;

/** 사이드바 항목(배열 순서가 기본 구성 순서) */
export const SIDEBAR_ITEM_TYPES = [
  "PROFILE",
  "CATEGORIES",
  "RECENT_POSTS",
  "RECENT_COMMENTS",
  "POPULAR_POSTS",
  "TAGS",
  "ARCHIVE",
  "VISITORS",
  "SEARCH",
  "FEED_LINKS",
] as const;
export type SidebarItemType = (typeof SIDEBAR_ITEM_TYPES)[number];

export interface SidebarPost {
  id: number;
  title: string;
  publishedAt: string | null;
}

export interface SidebarComment {
  id: number;
  postId: number;
  postTitle: string;
  excerpt: string;
  authorName: string;
  guest: boolean;
  createdAt: string;
}

/** 방문자 수(GET /blogs/{handle}/sidebar의 visitors, 대시보드·통계) */
export interface VisitorCounts {
  today: number;
  yesterday: number;
  total: number;
}

/** 월별 보관함 한 줄(GET /blogs/{handle}/archive). 연·월은 서비스 기준 시간대 */
export interface ArchiveMonth {
  year: number;
  month: number;
  postCount: number;
}

/** GET /blogs/{handle}/sidebar: 켜진 항목만 순서대로, 데이터는 그 항목이 켜졌을 때만 값 */
export interface SidebarView {
  items: SidebarItemType[];
  recentPosts: SidebarPost[] | null;
  popularPosts: SidebarPost[] | null;
  recentComments: SidebarComment[] | null;
  tags: BlogTag[] | null;
  archive: ArchiveMonth[] | null;
  visitors: VisitorCounts | null;
}

/** GET /blogs/{handle}/manage/sidebar, PUT /blogs/{handle}/sidebar */
export interface SidebarConfig {
  items: { type: SidebarItemType; enabled: boolean }[];
}

/** GET /blogs/{handle}/manage/stats */
export interface VisitStats {
  visitors: VisitorCounts;
  daily: { date: string; visitors: number }[];
  topPosts: { id: number; title: string; viewCount: number }[];
}

export type ExportStatus = "PENDING" | "RUNNING" | "READY" | "FAILED" | "EXPIRED";

/** 블로그 백업(GET /blogs/{handle}/exports) */
export interface BlogExport {
  id: number;
  status: ExportStatus;
  fileSize: number | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
}

/** 차단한 회원(GET /blogs/{handle}/blocks) */
export interface BlockedUser {
  user: { userId: number; nickname: string; profileImageUrl: string | null };
  blockedAt: string;
}
