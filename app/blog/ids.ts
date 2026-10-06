/**
 * 블로그 주소(handle) 규칙(FR-002, research.md R5): 영문 소문자·숫자·하이픈 3~20자,
 * 처음과 끝은 영문 소문자·숫자, 하이픈 연속 금지. 예약어 검사는 backend가 한다.
 */
export const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,18})[a-z0-9]$/;

export function isValidHandle(value: string | null | undefined): value is string {
  return typeof value === "string" && HANDLE_PATTERN.test(value) && !value.includes("--");
}

/** 글 번호(`/:handle/:postId`의 postId). 숫자만, 0으로 시작하지 않고, JavaScript 정수로 안전한 범위. */
const POST_ID_PATTERN = /^[1-9]\d{0,15}$/;

export function parsePostId(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !POST_ID_PATTERN.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}
