import type { ApiFieldError } from "~/api/types";
import { POST_STATUS_FILTERS, POST_VISIBILITY_FILTERS, oneOf } from "~/manage/postFilters";
import type { ReportableType } from "~/moderation/reportTarget";

/**
 * 콘솔 콘텐츠 관리(006 FR-102·104, T037)의 검색 조건. 탭 3개(글·댓글·방명록)가 같은 폼 컴포넌트와 같은 규칙을 쓴다.
 * 화면 주소의 쿼리가 그대로 backend 쿼리가 된다(`page`만 1부터 → 0부터).
 */
export type ContentKind = "posts" | "comments" | "guestbook";

export const CONTENT_KINDS: readonly ContentKind[] = ["posts", "comments", "guestbook"];

export const CONTENTS_PATH = "/admin/contents";

/** 화면 경로 */
export const contentPath = (kind: ContentKind) => `${CONTENTS_PATH}/${kind}`;

/** 검색 API(006 contracts/api.md) */
export const CONTENT_API: Record<ContentKind, string> = {
  posts: "/admin/contents/posts",
  comments: "/admin/contents/comments",
  guestbook: "/admin/contents/guestbook-entries",
};

/** 005 숨김 API의 대상 종류(`PUT·DELETE /admin/contents/{segment}/{id}/hidden`) */
export const CONTENT_HIDE_TYPE: Record<ContentKind, ReportableType> = {
  posts: "POST",
  comments: "COMMENT",
  guestbook: "GUESTBOOK",
};

export type ContentField = "q" | "handle" | "authorId" | "postId" | "status" | "visibility";

/** 탭마다 폼에 보이는 조건(순서대로) */
export const CONTENT_FIELDS: Record<ContentKind, readonly ContentField[]> = {
  posts: ["q", "handle", "authorId", "status", "visibility"],
  comments: ["postId", "handle", "authorId", "status", "q"],
  guestbook: ["handle", "authorId", "status", "q"],
};

/** 댓글·방명록 상태(005 숨김 포함) */
export const ENTRY_STATUSES = ["ACTIVE", "DELETED", "HIDDEN"] as const;

export const CONTENT_PAGE_SIZE = 20;
const QUERY_MAX = 100;
const HANDLE_MAX = 30;
const ID_PATTERN = /^\d{1,18}$/;

export interface ContentFilters {
  q: string;
  handle: string;
  authorId: string;
  postId: string;
  status: string;
  visibility: string;
  page: number;
}

/** 탭의 상태 선택지 */
export function statusOptions(kind: ContentKind): readonly string[] {
  return kind === "posts" ? POST_STATUS_FILTERS : ENTRY_STATUSES;
}

/**
 * 주소 쿼리를 조건으로. 탭에 없는 조건, 숫자가 아닌 번호, 모르는 상태·공개 범위는 버린다(빈 문자열).
 * `page`는 1부터(잘못된 값은 1).
 */
export function parseContentFilters(kind: ContentKind, search: URLSearchParams): ContentFilters {
  const fields = CONTENT_FIELDS[kind];
  const text = (field: ContentField, max: number) =>
    fields.includes(field) ? (search.get(field) ?? "").trim().slice(0, max) : "";
  const id = (field: ContentField) => {
    const value = text(field, 18);
    return ID_PATTERN.test(value) ? value : "";
  };
  const pageText = search.get("page");
  const page = pageText && /^\d{1,6}$/.test(pageText) ? Math.max(1, Number(pageText)) : 1;
  return {
    q: text("q", QUERY_MAX),
    handle: text("handle", HANDLE_MAX).toLowerCase(),
    authorId: id("authorId"),
    postId: id("postId"),
    status: fields.includes("status")
      ? (oneOf(statusOptions(kind), search.get("status")) ?? "")
      : "",
    visibility: fields.includes("visibility")
      ? (oneOf(POST_VISIBILITY_FILTERS, search.get("visibility")) ?? "")
      : "",
    page,
  };
}

/** 값이 있는 조건만(주소·backend 쿼리 공통) */
function present(filters: ContentFilters): Record<string, string> {
  const entries: [string, string][] = [
    ["q", filters.q],
    ["handle", filters.handle],
    ["authorId", filters.authorId],
    ["postId", filters.postId],
    ["status", filters.status],
    ["visibility", filters.visibility],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== ""));
}

/** backend 쿼리(`page`는 0부터) */
export function contentQuery(filters: ContentFilters): Record<string, string | number> {
  return { ...present(filters), page: filters.page - 1, size: CONTENT_PAGE_SIZE };
}

/** 같은 조건의 다른 페이지 주소 */
export function contentHref(kind: ContentKind, filters: ContentFilters, page = 1): string {
  const params = new URLSearchParams(present(filters));
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `${contentPath(kind)}?${query}` : contentPath(kind);
}

/** 댓글·방명록의 내용 검색은 블로그·글·작성자 중 하나가 있어야 한다(backend `SCOPE_REQUIRED`와 같은 규칙) */
export function needsScope(kind: ContentKind, filters: ContentFilters): boolean {
  return (
    kind !== "posts" && filters.q !== "" && !filters.handle && !filters.authorId && !filters.postId
  );
}

/** backend 400의 `q` `INVALID` + `params.reason=SCOPE_REQUIRED` */
export function isScopeRequired(errors: readonly ApiFieldError[]): boolean {
  return errors.some((error) => error.field === "q" && error.params?.reason === "SCOPE_REQUIRED");
}
