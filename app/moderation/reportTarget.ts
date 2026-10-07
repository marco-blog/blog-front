import type { ReportTargetType } from "~/api/models";

/** 서비스 안 콘텐츠 신고 대상(숨김·대상 지정이 되는 종류) */
export type ReportableType = Extract<
  ReportTargetType,
  "POST" | "COMMENT" | "GUESTBOOK" | "TRACKBACK"
>;

/** 신고 레이어로 받는 대상: 서비스 콘텐츠 + 007 포털의 외부 글("삭제 요청"). 외부 블로그는 관리자 신고 화면에만 나온다 */
export type ReportFormType = ReportableType | "EXTERNAL_POST";

const PREFIX: Record<ReportFormType, string> = {
  POST: "post",
  COMMENT: "comment",
  GUESTBOOK: "guestbook",
  TRACKBACK: "trackback",
  EXTERNAL_POST: "external",
};
export const REPORTABLE_TYPES: ReportableType[] = ["POST", "COMMENT", "GUESTBOOK", "TRACKBACK"];
const TYPE_BY_PREFIX = Object.fromEntries(
  REPORTABLE_TYPES.map((type) => [PREFIX[type], type]),
) as Record<string, ReportableType>;

export function isReportableType(value: unknown): value is ReportableType {
  return typeof value === "string" && (REPORTABLE_TYPES as string[]).includes(value);
}

/** 신고 레이어가 보내는 종류인지(`intent=report`) */
export function isReportFormType(value: unknown): value is ReportFormType {
  return isReportableType(value) || value === "EXTERNAL_POST";
}

/** 신고 대상의 화면 열쇠(`comment-12`, `external-7`). JS 없는 화면의 `?report=` 값과 action 결과의 `key`에 쓴다 */
export function reportKey(type: ReportFormType, id: number): string {
  return `${PREFIX[type]}-${id}`;
}

/** `?report=comment-12` → 대상. 모르는 값이면 null */
export function parseReportKey(
  value: string | null | undefined,
): { type: ReportableType; id: number } | null {
  const match = /^([a-z]+)-(\d{1,16})$/.exec(value ?? "");
  const type = match ? TYPE_BY_PREFIX[match[1]] : undefined;
  const id = match ? Number(match[2]) : 0;
  return type && Number.isSafeInteger(id) && id > 0 ? { type, id } : null;
}

/** 항목 앵커(`#comment-12`). 글은 앵커 없이 글 주소 자체 */
export function targetAnchor(type: ReportFormType, id: number): string {
  return type === "POST" ? "" : `#${PREFIX[type]}-${id}`;
}

/** 권리 침해 신고 화면 주소(`/rights-request?url=`). `path`는 이 화면의 경로(앵커 포함 가능) */
export function rightsRequestHref(path: string): string {
  return `/rights-request?url=${encodeURIComponent(path)}`;
}

/**
 * 관리자 "대상 지정"의 서비스 안 주소를 대상으로(contracts/routes.md): `/{handle}/{postId}` → 글,
 * `…#comment-{id}` → 댓글, `/{handle}/guestbook#guestbook-{id}` → 방명록 글, `…#trackback-{id}` → 트랙백.
 * 해석할 수 없으면 null. 출처는 보지 않는다(backend가 대상이 있는지 확인한다).
 */
export function parseTargetUrl(value: string): { type: ReportableType; id: number } | null {
  let url: URL;
  try {
    url = new URL(value.trim(), "http://service.invalid");
  } catch {
    return null;
  }
  const anchor = parseReportKey(url.hash.replace(/^#/, ""));
  if (anchor && anchor.type !== "POST") {
    return anchor;
  }
  const match = /^\/[a-z0-9-]{1,40}\/(\d{1,16})\/?$/.exec(url.pathname);
  const id = match ? Number(match[1]) : 0;
  return match && Number.isSafeInteger(id) && id > 0 ? { type: "POST", id } : null;
}

/** 관리자 숨김 API의 경로 조각(`/admin/contents/{segment}/{id}/hidden`) */
export const CONTENT_PATH_SEGMENT: Record<ReportableType, string> = {
  POST: "posts",
  COMMENT: "comments",
  GUESTBOOK: "guestbook-entries",
  TRACKBACK: "trackbacks",
};

export function hiddenContentPath(type: ReportableType, id: number): string {
  return `/admin/contents/${CONTENT_PATH_SEGMENT[type]}/${id}/hidden`;
}
