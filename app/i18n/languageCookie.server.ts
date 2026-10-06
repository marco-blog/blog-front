import { LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE, type Language } from "./config";

/**
 * 방문자가 고른 언어를 기억하는 쿠키 `lang`(1년, FR-149 (2)). 화면 JS가 읽지 않으므로 HttpOnly,
 * 운영(HTTPS)에서는 Secure. 하단 언어 선택(`/locale`)과 언어 설정(`/settings/language`)이 쓴다.
 */
export function languageCookie(
  language: Language,
  secure = process.env.NODE_ENV === "production",
): string {
  return `${LANGUAGE_COOKIE}=${encodeURIComponent(language)}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
