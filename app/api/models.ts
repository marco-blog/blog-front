/**
 * 001 API의 result 형식(contracts/api.md). backend OpenAPI가 나오면 생성 타입(app/api/schema.d.ts)으로 바꾼다.
 * 지금은 backend와 병행 개발 중이라 계약 문서를 그대로 옮겨 적었다.
 */

/** 004가 보호 글(`PROTECTED`, FR-062)과 예약 글(`SCHEDULED`, FR-064)을 더했다. */
export type Visibility = "PUBLIC" | "PRIVATE" | "PROTECTED";
/** `HIDDEN`은 관리자가 숨긴 글(005 FR-041). 주인에게만 보인다 */
export type PostStatus = "DRAFT" | "PUBLISHED" | "DELETED" | "SCHEDULED" | "HIDDEN";

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
  /** 트랙백 받기(005 FR-053, 기본 true) */
  trackbackEnabled?: boolean;
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
  /** 관리자가 숨긴 글(005 FR-041). 주인에게만 true일 수 있다(다른 사람에게는 404) */
  hidden?: boolean;
  /** 이 글의 트랙백 주소(005). 본문 노출 가능 + 블로그 트랙백 받기일 때만 */
  trackbackUrl?: string | null;
  /** 받은 트랙백 수(005) */
  trackbackCount?: number;
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
  /** 트랙백 보내기(005 FR-052): 최대 10개, http/https */
  trackbackUrls?: string[];
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
  /**
   * 관리자가 숨긴 댓글(005). 작성 회원에게는 내용과 true, 다른 사람에게는 보이는 답글이 있을 때만
   * `{ hidden: true, content: null, author: null }` 자리
   */
  hidden?: boolean;
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
  /** 비회원 쓰기의 CAPTCHA 토큰(005 FR-141). 회원은 보내지 않는다 */
  captchaToken?: string;
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
  /** 관리자가 숨겨서 건너뛴 글 수(005, 공개 범위 변경·공지) */
  skipped?: number;
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
/** 005 신고 처리 알림(target `REPORT`, params `{ targetType, decision: "ACTIONED" | "DISMISSED" }`). 링크 없음 */
export const REPORT_RESOLVED_NOTIFICATION = "REPORT_RESOLVED";
/** 아는 알림 종류(002 댓글·구독, 004 백업). 이후 스펙이 더하므로 응답의 `type`은 string으로 받는다(모르는 값은 공통 문구). */
/** 007 외부 블로그 알림(target `EXTERNAL_BLOG`, params `{ externalBlogTitle, reason? , lastResult? }`). 링크는 그 등록의 관리 화면 */
export const EXTERNAL_BLOG_NOTIFICATIONS = [
  "EXTERNAL_BLOG_APPROVED",
  "EXTERNAL_BLOG_REJECTED",
  "EXTERNAL_FEED_STOPPED",
] as const;
export const NOTIFICATION_TYPES = [
  "NEW_COMMENT",
  "NEW_SUBSCRIBER",
  BACKUP_READY_NOTIFICATION,
  REPORT_RESOLVED_NOTIFICATION,
  ...EXTERNAL_BLOG_NOTIFICATIONS,
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
/** 포털 카드 출처(007). 내부 글(posts)과 외부 블로그에서 수집한 글(external_posts) */
export type PortalCardSource = "INTERNAL" | "EXTERNAL";

/** 포털 최신 글·주제 글의 출처 필터(007 `?source=`) */
export type PortalSource = "all" | "internal" | "external";
export const PORTAL_SOURCES: readonly PortalSource[] = ["all", "internal", "external"];

/**
 * 포털 카드(003, 007 확장). `id`는 출처별 id라 React 키는 `${source}-${id}`. 외부 카드는 `blog.handle`·`author`가 null,
 * `visitUrl`(`/api/v1/external-posts/{id}/visit`)과 `externalBlog`가 값이다.
 */
export interface PortalCard {
  id: number;
  source: PortalCardSource;
  title: string;
  summary: string | null;
  thumbnailUrl: string | null;
  topicId: number | null;
  blog: { handle: string | null; title: string };
  author: { nickname: string; profileImageUrl: string | null } | null;
  externalBlog: { id: number; title: string; siteHost: string } | null;
  visitUrl: string | null;
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
  /** 관리자가 숨긴 방명록 글(005). 표시 규칙은 Comment.hidden과 같다 */
  hidden?: boolean;
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
  /** 비회원 쓰기의 CAPTCHA 토큰(005 FR-141). 회원은 보내지 않는다 */
  captchaToken?: string;
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

// ---- 005 신고·스팸 방어·트랙백(005 contracts/api.md) ----

/** 신고 대상 종류. `EXTERNAL_*`은 007 처리기(외부 글은 회원 신고·권리 침해 신고, 외부 블로그는 관리자 화면) */
export const REPORT_TARGET_TYPES = [
  "POST",
  "COMMENT",
  "GUESTBOOK",
  "TRACKBACK",
  "EXTERNAL_POST",
  "EXTERNAL_BLOG",
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** 신고 사유(화면 순서) */
export const REPORT_REASONS = [
  "SPAM",
  "ABUSE",
  "ADULT",
  "ILLEGAL",
  "PRIVACY",
  "COPYRIGHT",
  "DEFAMATION",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** 권리 침해 신고가 받는 사유 */
export const RIGHTS_REQUEST_REASONS = ["COPYRIGHT", "PRIVACY", "DEFAMATION", "OTHER"] as const;

/** 조치. `REMOVE_FROM_PORTAL`(외부 글)·`BLOCK_EXTERNAL_BLOG`(외부 블로그)는 007 */
export type ReportAction =
  "HIDE_CONTENT" | "SUSPEND_USER" | "REMOVE_FROM_PORTAL" | "BLOCK_EXTERNAL_BLOG";
export type ReportStatus = "PENDING" | "ACTIONED" | "DISMISSED";
export type ReportChannel = "MEMBER" | "RIGHTS_REQUEST";

/** 관리자 화면의 신고 대상 미리보기 */
export interface ReportTargetPreview {
  type: ReportTargetType;
  id: number;
  state: "ACTIVE" | "HIDDEN" | "DELETED" | "MISSING";
  title: string | null;
  text: string | null;
  url: string | null;
  author: { userId: number | null; nickname: string | null; guest: boolean } | null;
  /** 007 외부 대상은 서비스 블로그가 아니라 `handle`이 null */
  blog: { handle: string | null; title: string } | null;
}

/** GET /admin/reports 한 줄(대상별 묶음) */
export interface ReportGroup {
  representativeId: number;
  targetType: ReportTargetType | null;
  targetId: number | null;
  channel: ReportChannel | "MIXED";
  reportCount: number;
  reasons: { reason: ReportReason; count: number }[];
  firstReportedAt: string;
  lastReportedAt: string;
  status: ReportStatus;
  action: ReportAction | null;
  target: ReportTargetPreview | null;
}

/** GET /admin/reports/{id} */
export interface ReportDetail {
  id: number;
  channel: ReportChannel;
  status: ReportStatus;
  action: ReportAction | null;
  resolutionNote: string | null;
  handledBy: { id: number; nickname: string } | null;
  handledAt: string | null;
  targetUrl: string | null;
  rightsBasis: string | null;
  contactEmail: string | null;
  target: ReportTargetPreview | null;
  reports: {
    id: number;
    channel: ReportChannel;
    reporter: { id: number; nickname: string } | null;
    reason: ReportReason;
    detail: string | null;
    createdAt: string;
  }[];
  targetUserReportCount: number | null;
}

/** POST /admin/reports/{id}/resolve 결과 */
export interface ResolveReportResult {
  resolvedCount: number;
  decision: ReportStatus;
  action: ReportAction | null;
}

export type UserStatus = "ACTIVE" | "SUSPENDED" | "WITHDRAWN";
export type UserRole = "USER" | "ADMIN" | "SUPER_ADMIN";

/** GET /admin/users 한 줄(이메일은 주지 않는다) */
export interface AdminUserSummary {
  id: number;
  nickname: string;
  status: UserStatus;
  role: UserRole;
  createdAt: string;
  blogCount: number;
}

/** GET /admin/users/{id} */
export interface AdminUserDetail extends AdminUserSummary {
  postCount: number;
  receivedReportCount: number;
  lastLoginAt: string | null;
  blogs: { handle: string; title: string; status: "ACTIVE" | "DELETED" }[];
  blogLimit: { current: number; limit: number; custom: boolean };
}

/** 금칙어(관리자) */
export interface BannedWord {
  id: number;
  word: string;
  scope: "NAME" | "CONTENT" | "ALL";
  action: "REJECT" | "MASK";
  createdBy: { id: number; nickname: string };
  createdAt: string;
  updatedAt: string;
}

/** GET /captcha/config */
export interface CaptchaConfig {
  provider: "turnstile" | "test" | "none";
  siteKey: string | null;
}

/** GET /posts/{id}/trackbacks 한 줄. 모든 값은 텍스트로만 출력한다 */
export interface Trackback {
  id: number;
  title: string;
  excerpt: string | null;
  blogName: string | null;
  url: string;
  receivedAt: string;
  /** 서비스 안 글이 보낸 것 */
  internal: boolean;
}

/** GET /blogs/{handle}/manage/trackbacks 한 줄 */
export type ManagedTrackback = Trackback & { hidden: boolean; post: { id: number; title: string } };

/** GET /posts/{id}/trackback-pings 한 줄 */
export interface TrackbackPing {
  id: number;
  targetUrl: string;
  status: "PENDING" | "SUCCESS" | "FAILED";
  errorCode: "INVALID_URL" | "BLOCKED_ADDRESS" | "TIMEOUT" | "HTTP_ERROR" | "REMOTE_ERROR" | null;
  errorMessage: string | null;
  attemptedAt: string | null;
  createdAt: string;
}

// ---- 006 관리 콘솔(006 contracts/api.md) ----

/** GET /admin/dashboard. 날짜 경계는 요청한 관리자의 시간대(`timeZone`) */
export interface AdminDashboard {
  today: { signups: number; publishedPosts: number; comments: number };
  totals: { members: number; blogs: number; publicPosts: number };
  /** 처리 대기 신고 수. 신고 기능이 연결되기 전에는 null(카드 숨김) */
  pendingReports: number | null;
  /** 오늘 포함 7일, 오래된 날 먼저 */
  trend: { date: string; signups: number; publishedPosts: number }[];
  timeZone: string;
  /** 수치를 계산한 시각(UTC). 최대 캐시 TTL 전 */
  generatedAt: string;
}

/** 콘텐츠 관리 표의 작성자 */
export interface AdminRef {
  userId: number;
  nickname: string;
  status: UserStatus;
}

/** GET /admin/contents/posts 한 줄(본문·요약·대표 이미지 없음) */
export interface AdminPostRow {
  id: number;
  title: string;
  blog: { handle: string; title: string; status: "ACTIVE" | "DELETED" };
  author: AdminRef;
  status: PostStatus;
  visibility: Visibility;
  publishedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  commentCount: number;
}

/** GET /admin/contents/comments 한 줄. 비밀 댓글은 content null, 비회원은 author null */
export interface AdminCommentRow {
  id: number;
  postId: number;
  postTitle: string;
  blogHandle: string;
  parentId: number | null;
  author: AdminRef | null;
  guestName: string | null;
  secret: boolean;
  content: string | null;
  status: "ACTIVE" | "DELETED" | "HIDDEN";
  createdAt: string;
}

/** GET /admin/contents/guestbook-entries 한 줄 */
export type AdminGuestbookRow = Omit<AdminCommentRow, "postId" | "postTitle">;

/** GET /admin/service-settings(읽기 전용, 비밀 값 없음) */
export interface ServiceSettings {
  termsVersion: string;
  blogs: { defaultMaxPerMember: number };
  media: {
    maxFileSize: number;
    maxPixels: number;
    tempQuota: number;
    /** ISO-8601 기간 */
    tempTtl: string;
    allowedTypes: string[];
  };
  admin: { auditRetention: string; dashboardCacheTtl: string };
}

/** GET /admin/audit-logs 한 줄 */
export interface AuditLogEntry {
  id: number;
  admin: { userId: number; nickname: string };
  action: string;
  targetType: string;
  targetId: number | null;
  targetKey: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
  /** 상세(GET /admin/audit-logs/{id})만. 최고 관리자에게만 값이 있다 */
  requestIp?: string | null;
}

/** GET /admin/audit-logs/actions */
export interface AuditActionList {
  actions: string[];
  targetTypes: string[];
}

/** GET /admin/admins 한 줄, PUT /admin/users/{id}/role 응답 */
export interface AdminMember {
  userId: number;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

/** 릴리스 노트 상태(003) */
export type ReleaseNoteStatus = "DRAFT" | "PUBLISHED";

/** 릴리스 노트 언어판 하나(제목 + Markdown 원문) */
export interface ReleaseNoteContentWrite {
  title: string;
  contentMarkdown: string;
}

/** 릴리스 노트 쓰기 요청(POST /admin/release-notes, PUT은 `baseRevisionNo`를 더함) */
export interface ReleaseNoteWrite {
  version: string;
  releaseDate: string;
  contents: Record<string, ReleaseNoteContentWrite>;
  baseRevisionNo?: number;
}

/** GET /admin/release-notes 한 줄 */
export interface AdminReleaseNoteSummary {
  id: number;
  version: string;
  status: ReleaseNoteStatus;
  releaseDate: string;
  langs: string[];
  revisionNo: number;
  firstPublishedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

/** GET /admin/release-notes/{id} */
export interface AdminReleaseNote {
  id: number;
  version: string;
  releaseDate: string;
  contents: Record<string, ReleaseNoteContentWrite>;
  status: ReleaseNoteStatus;
  revisionNo: number;
  firstPublishedAt: string | null;
  publishedAt: string | null;
  createdBy: UserRef;
  updatedBy: UserRef;
  createdAt: string;
  updatedAt: string;
}

/** GET /admin/release-notes/{id}/revisions[/{no}]. 목록에서는 version·releaseDate·contents가 null */
export interface AdminRevision {
  revisionNo: number;
  editedBy: UserRef;
  editedAt: string;
  status: ReleaseNoteStatus;
  version: string | null;
  releaseDate: string | null;
  contents: Record<string, ReleaseNoteContentWrite> | null;
}

/** POST /admin/release-notes/preview */
export interface ReleaseNotePreview {
  contentHtml: string;
  toc: ReleaseNoteTocEntry[];
}

/* ---------- 007 외부 블로그(007 contracts/api.md) ---------- */

export type ExternalBlogStatus =
  "PENDING" | "REJECTED" | "ACTIVE" | "PAUSED" | "STOPPED" | "BLOCKED" | "RELEASED";
export const EXTERNAL_BLOG_STATUSES: readonly ExternalBlogStatus[] = [
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "STOPPED",
  "BLOCKED",
  "REJECTED",
  "RELEASED",
];

export type FeedFormat = "RSS" | "ATOM";

export type FetchResultCode =
  | "OK"
  | "NOT_MODIFIED"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "PARSE_ERROR"
  | "BLOCKED_ADDRESS"
  | "DNS_ERROR";

export type ExternalTopicSource = "OWNER" | "REVIEW" | "RULE" | "AUTO" | "DEFAULT";
export const EXTERNAL_TOPIC_SOURCES: readonly ExternalTopicSource[] = [
  "OWNER",
  "REVIEW",
  "RULE",
  "AUTO",
  "DEFAULT",
];

export type ExternalPostStatus = "ACTIVE" | "REMOVED";
export type ExternalRemovedReason =
  "LINK_BROKEN" | "BLOG_BLOCKED" | "MEMBER_WITHDRAWN" | "REPORT" | "ADMIN";

/** POST /external-blog-previews */
export interface FeedPreview {
  feedUrl: string;
  siteUrl: string | null;
  title: string | null;
  format: FeedFormat;
  recentPosts: { title: string; link: string; publishedAt: string | null }[];
  registered: {
    externalBlogId: number;
    status: ExternalBlogStatus;
    claimable: boolean;
    mine: boolean;
  } | null;
}

/** POST /me/external-blog-verifications, …/{id}/check */
export interface Verification {
  id: number;
  feedUrl: string;
  code: string;
  expiresAt: string;
  verifiedAt: string | null;
  claimableExternalBlogId: number | null;
}

/** GET /me/external-blogs 한 줄 */
export interface MyExternalBlog {
  id: number;
  title: string | null;
  siteUrl: string | null;
  feedUrl: string;
  feedFormat: FeedFormat | null;
  status: ExternalBlogStatus;
  registrationType: "MEMBER_REQUEST" | "ADMIN_DIRECT";
  ownershipVerified: boolean;
  defaultTopicId: number;
  rejectReason: string | null;
  lastFetchedAt: string | null;
  lastSuccessAt: string | null;
  lastFetchResult: FetchResultCode | null;
  postCount: number;
  createdAt: string;
}

/** GET /me/external-blogs/{id}/posts 한 줄 */
export interface MyExternalPost {
  id: number;
  title: string;
  summary: string | null;
  link: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  topicId: number;
  topicSource: ExternalTopicSource;
  status: ExternalPostStatus;
  removedReason: ExternalRemovedReason | null;
  clickCount: number;
}

/** GET /admin/external-blogs 한 줄 */
export type AdminExternalBlog = MyExternalBlog & {
  member: { userId: number; nickname: string; status: "ACTIVE" | "SUSPENDED" | "WITHDRAWN" } | null;
  registrationBasis: string | null;
  reviewedBy: UserRef | null;
  reviewedAt: string | null;
  ownershipVerifiedAt: string | null;
  nextFetchAt: string | null;
  lastHttpStatus: number | null;
  consecutiveFailures: number;
  firstFailedAt: string | null;
  pendingReviewCount: number;
};

/** GET /admin/external-blogs/{id}/posts 한 줄 */
export type AdminExternalPost = MyExternalPost & {
  guid: string | null;
  imageUrl: string | null;
  feedTerms: string[];
  classifierTopicId: number | null;
  classifierConfidence: number | null;
  classifierVersion: string | null;
  excluded: { reason: string; excludedBy: UserRef; createdAt: string } | null;
  linkCheckedAt: string | null;
};

/** PUT /admin/portal/external-exclusions/{externalPostId} */
export interface ExternalExclusion {
  externalPostId: number;
  reason: string;
  excludedBy: UserRef;
  createdAt: string;
}

export type ClassificationReviewStatus = "PENDING" | "CONFIRMED" | "SKIPPED";

/** GET /admin/classification-reviews 한 줄 */
export interface ClassificationReview {
  id: number;
  status: ClassificationReviewStatus;
  post: {
    id: number;
    title: string;
    summary: string | null;
    link: string;
    feedTerms: string[];
    topicId: number;
    topicSource: string;
  };
  externalBlog: { id: number; title: string | null; defaultTopicId: number };
  predictedTopicId: number | null;
  confidence: number | null;
  confirmedTopicId: number | null;
  reviewedBy: UserRef | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** POST /admin/classification-reviews/confirm-batch */
export interface ClassificationBatchResult {
  confirmed: number[];
  /** 이미 처리된 검수는 그 상태, 없는 id는 `NOT_FOUND` */
  skipped: { id: number; status: ClassificationReviewStatus | "NOT_FOUND" }[];
}

/** GET /admin/classification-stats */
export interface ClassificationStats {
  window: { from: string; to: string };
  classifierAccuracy: { sample: number; correct: number; rate: number | null };
  finalAccuracy: { sample: number; unchanged: number; rate: number | null };
  distribution: {
    topicId: number;
    total: number;
    bySource: Record<ExternalTopicSource, number>;
  }[];
  pendingReviews: number;
  minConfidence: number;
  classifierVersion: string;
  generatedAt: string;
}

/** GET /admin/topic-mapping-rules 한 줄 */
export interface TopicMappingRule {
  id: number;
  keyword: string;
  topicId: number;
  priority: number;
  createdBy: UserRef;
  createdAt: string;
  updatedAt: string;
}
