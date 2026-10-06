/**
 * 로그인 화면 주소와 `next` 검증. 서버(loader·action)와 브라우저(자동 리프레시 실패 시 이동)가 함께 쓴다.
 */

/** 로그인 화면 경로(contracts/routes.md) */
export const LOGIN_PATH = "/login";

/** 검사에 쓰는 임시 기준 주소. 이 주소와 출처가 같은 경로만 받는다. */
const SAME_SITE_BASE = "http://same-site.invalid";

/**
 * 로그인 뒤 돌아갈 `next` 값을 같은 사이트의 상대 경로로만 받는다(열린 리다이렉트 방지).
 * `/`로 시작하지 않거나, `//`·`/\`처럼 다른 호스트로 해석되는 값, 절대 주소는 `fallback`을 돌려준다.
 */
export function safeNextPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(value, SAME_SITE_BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== SAME_SITE_BASE) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/login?next=...`. next가 첫 화면이거나 같은 사이트 경로가 아니면 붙이지 않는다. */
export function loginPath(next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe === "/" ? LOGIN_PATH : `${LOGIN_PATH}?next=${encodeURIComponent(safe)}`;
}
