/**
 * backend 공통 응답 틀(blog-docs/api-guidelines.md 4절).
 * 기능별 result 타입은 backend OpenAPI에서 생성한다(app/api/schema.d.ts, 기능 구현 때 추가).
 */
export interface ApiFieldError {
  field: string;
  code: string;
  params?: Record<string, unknown>;
}

export interface ApiHeader {
  isSuccessful: boolean;
  resultCode: string;
  resultMessage: string;
  fieldErrors?: ApiFieldError[];
  traceId?: string;
  /** 오류 상세 값(007부터, 예: `EXTERNAL_FEED_URL_NOT_ALLOWED`의 `reason`). 없으면 생략 */
  params?: Record<string, unknown>;
}

export interface ApiEnvelope<T> {
  header: ApiHeader;
  result: T;
  totalCount?: number;
  nextCursor?: string | null;
}

export function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (typeof value !== "object" || value === null || !("header" in value)) {
    return false;
  }
  const header = (value as { header: unknown }).header;
  return (
    typeof header === "object" &&
    header !== null &&
    typeof (header as ApiHeader).isSuccessful === "boolean" &&
    typeof (header as ApiHeader).resultCode === "string"
  );
}
