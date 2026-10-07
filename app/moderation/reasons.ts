import { REPORT_REASONS, RIGHTS_REQUEST_REASONS, type ReportReason } from "~/api/models";
import type { ApiFieldError } from "~/api/types";

export { REPORT_REASONS, RIGHTS_REQUEST_REASONS };

/** 신고 설명 최대 길이(backend `Report.DETAIL_MAX`) */
export const REPORT_DETAIL_MAX = 1000;
/** 권리 침해 신고 입력 길이(backend와 같다) */
export const RIGHTS_URL_MAX = 1000;
export const RIGHTS_BASIS_MAX = 2000;
export const CONTACT_EMAIL_MAX = 254;

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

export function isRightsRequestReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (RIGHTS_REQUEST_REASONS as readonly string[]).includes(value);
}

/** 회원 신고 미리 검사(backend와 같은 규칙): 사유 필수, 설명 1000자 이하, 기타면 설명 필수 */
export function reportFieldErrors(reason: string, detail: string): ApiFieldError[] {
  const errors: ApiFieldError[] = [];
  if (!isReportReason(reason)) {
    errors.push({ field: "reason", code: reason === "" ? "REQUIRED" : "INVALID" });
  }
  if (detail.length > REPORT_DETAIL_MAX) {
    errors.push({ field: "detail", code: "TOO_LONG", params: { max: REPORT_DETAIL_MAX } });
  } else if (reason === "OTHER" && detail === "") {
    errors.push({ field: "detail", code: "REQUIRED" });
  }
  return errors;
}

/** 이메일 형식(001 규칙: @ 앞뒤가 있고 공백 없음, 도메인에 점) */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RightsRequestInput {
  targetUrl: string;
  reason: string;
  rightsBasis: string;
  contactEmail: string;
}

/** 권리 침해 신고 미리 검사(contracts/api.md "신고") */
export function rightsRequestFieldErrors(input: RightsRequestInput): ApiFieldError[] {
  const errors: ApiFieldError[] = [];
  if (input.targetUrl === "") {
    errors.push({ field: "targetUrl", code: "REQUIRED" });
  } else if (input.targetUrl.length > RIGHTS_URL_MAX) {
    errors.push({ field: "targetUrl", code: "TOO_LONG", params: { max: RIGHTS_URL_MAX } });
  } else if (!isHttpUrl(input.targetUrl)) {
    errors.push({ field: "targetUrl", code: "INVALID_FORMAT" });
  }
  if (!isRightsRequestReason(input.reason)) {
    errors.push({ field: "reason", code: input.reason === "" ? "REQUIRED" : "INVALID" });
  }
  if (input.rightsBasis === "") {
    errors.push({ field: "rightsBasis", code: "REQUIRED" });
  } else if (input.rightsBasis.length > RIGHTS_BASIS_MAX) {
    errors.push({ field: "rightsBasis", code: "TOO_LONG", params: { max: RIGHTS_BASIS_MAX } });
  }
  if (input.contactEmail === "") {
    errors.push({ field: "contactEmail", code: "REQUIRED" });
  } else if (input.contactEmail.length > CONTACT_EMAIL_MAX || !EMAIL.test(input.contactEmail)) {
    errors.push({ field: "contactEmail", code: "INVALID_FORMAT" });
  }
  return errors;
}

/** http·https 절대 주소인지 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
