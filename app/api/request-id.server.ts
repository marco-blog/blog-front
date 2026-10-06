import { randomBytes } from "node:crypto";

/** 요청 추적 ID 헤더. backend RequestIdFilter와 같은 이름·형식을 쓴다. */
export const REQUEST_ID_HEADER = "X-Request-Id";

const VALID_REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === "string" && VALID_REQUEST_ID.test(value);
}

/** backend와 같은 16자리 16진수 ID를 만든다. */
export function newRequestId(): string {
  return randomBytes(8).toString("hex");
}

/** 들어온 값이 형식에 맞으면 그대로, 아니면 새로 만든다. */
export function resolveRequestId(incoming: unknown): string {
  return isValidRequestId(incoming) ? incoming : newRequestId();
}
