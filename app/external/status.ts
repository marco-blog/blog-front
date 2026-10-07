import type { TFunction } from "i18next";

import { errorMessage } from "~/api/errorMessage";
import type { FormErrorData } from "~/api/formErrors";
import type { ExternalBlogStatus, FetchResultCode, MyExternalBlog } from "~/api/models";

/** 회원 외부 블로그 한도(backend `blog.external.member-limit` 기본값, FR-112) */
export const EXTERNAL_BLOG_MEMBER_LIMIT = 3;

/** 거절·해제는 한도에 세지 않는다(FR-112). */
export const NOT_COUNTED_STATUSES: readonly ExternalBlogStatus[] = ["REJECTED", "RELEASED"];

export function countsTowardLimit(blogs: readonly Pick<MyExternalBlog, "status">[]): number {
  return blogs.filter((blog) => !NOT_COUNTED_STATUSES.includes(blog.status)).length;
}

/** 상태 배지 문구 키: 해제됐지만 남긴 글이 있으면 "해제 · 글 남김" */
export function statusKey(blog: Pick<MyExternalBlog, "status" | "postCount">): string {
  if (blog.status === "RELEASED" && blog.postCount > 0) {
    return "external:status.RELEASED_KEPT";
  }
  return `external:status.${blog.status}`;
}

/** 수집 결과 문구 */
export function fetchResultLabel(t: TFunction, result: string | null | undefined): string {
  if (!result) {
    return t("external:common.never");
  }
  return t(`external:fetchResult.${result}`, { defaultValue: result });
}

/** 외부 블로그 화면 action의 오류: 공통 폼 오류 + backend `header.params`(이유·찾아본 곳 등) */
export type ExternalFormError = FormErrorData & { params?: Record<string, unknown> };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function unreadableResult(t: TFunction, params: Record<string, unknown>): string {
  const result = asString(params.result);
  const status = typeof params.httpStatus === "number" ? params.httpStatus : null;
  if (result === "HTTP_ERROR" && status !== null) {
    return t("external:errors.httpStatus", { status });
  }
  return fetchResultLabel(t, result as FetchResultCode | null);
}

/**
 * 007 오류 문구(contracts/routes.md "오류 문구"). `params`가 있는 코드는 이유별로 자세히, 나머지는 `errors:{code}`.
 * 소유 인증 확인 실패는 찾아본 곳별 결과를 이어 붙인다.
 */
export function externalErrorMessage(t: TFunction, error: ExternalFormError): string {
  const params = error.params ?? {};
  switch (error.resultCode) {
    case "EXTERNAL_FEED_URL_NOT_ALLOWED": {
      const reason = asString(params.reason);
      return reason
        ? t(`external:urlReason.${reason}`, { defaultValue: errorMessage(t, error) })
        : errorMessage(t, error);
    }
    case "EXTERNAL_FEED_NOT_FOUND": {
      const tried = Array.isArray(params.tried) ? params.tried.length : 0;
      return tried > 0
        ? t("external:errors.feedNotFound", { count: tried })
        : errorMessage(t, error);
    }
    case "EXTERNAL_FEED_UNREADABLE":
      return params.result
        ? t("external:errors.unreadable", { result: unreadableResult(t, params) })
        : errorMessage(t, error);
    case "EXTERNAL_BLOG_ALREADY_REGISTERED":
      if (params.mine === true) {
        return t("external:errors.alreadyMine");
      }
      if (params.claimable === false) {
        return t("external:errors.alreadyBlocked");
      }
      return t("external:errors.alreadyClaimable");
    case "EXTERNAL_VERIFICATION_CODE_NOT_FOUND": {
      const failures =
        params.failures && typeof params.failures === "object"
          ? (params.failures as Record<string, unknown>)
          : {};
      const checked = Array.isArray(params.checked) ? (params.checked as unknown[]) : [];
      const details = checked
        .filter((place): place is string => place === "FEED" || place === "SITE")
        .map((place) => {
          const failure = asString(failures[place]);
          const result = failure
            ? fetchResultLabel(t, failure)
            : t("external:errors.notFoundThere");
          return t(
            place === "FEED" ? "external:errors.checkedFeed" : "external:errors.checkedSite",
            {
              result,
            },
          );
        });
      return [t("external:errors.codeNotFound"), ...details].join(" ");
    }
    default:
      return errorMessage(t, error);
  }
}
