import { data } from "react-router";

import type { ApiFieldError } from "./types";

/** backend가 아닌 front가 정하는 오류 코드. 문구는 errors 네임스페이스에 있다. */
export const CLIENT_ERROR_CODES = {
  /** backend에 연결하지 못함 */
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  /** 공통 응답 틀이 아닌 응답 */
  INVALID_RESPONSE: "INVALID_RESPONSE",
} as const;

export interface ApiErrorInit {
  status: number;
  resultCode: string;
  resultMessage?: string;
  fieldErrors?: ApiFieldError[];
  traceId?: string;
}

/** backend 호출 실패(header.isSuccessful=false 등). 화면 문구는 resultCode로 번역한다(errors.{code}). */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly status: number;
  readonly resultCode: string;
  readonly resultMessage: string;
  readonly fieldErrors: ApiFieldError[];
  readonly traceId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(
      `${init.status} ${init.resultCode}${init.resultMessage ? `: ${init.resultMessage}` : ""}`,
    );
    this.status = init.status;
    this.resultCode = init.resultCode;
    this.resultMessage = init.resultMessage ?? "";
    this.fieldErrors = init.fieldErrors ?? [];
    this.traceId = init.traceId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 오류 경계·action 결과로 넘길 수 있는 직렬화 가능한 형태 */
export interface ApiErrorData {
  resultCode: string;
  fieldErrors: ApiFieldError[];
  traceId: string | null;
}

export function toApiErrorData(error: ApiError): ApiErrorData {
  return {
    resultCode: error.resultCode,
    fieldErrors: error.fieldErrors,
    traceId: error.traceId ?? null,
  };
}

/**
 * loader에서 `throw apiErrorResponse(error)`로 backend 상태 코드(404 등)를 그대로 화면 응답에 쓴다.
 * action에서는 return해 폼 오류(fieldErrors)를 보여준다.
 */
export function apiErrorResponse(error: ApiError) {
  return data(toApiErrorData(error), { status: error.status });
}
