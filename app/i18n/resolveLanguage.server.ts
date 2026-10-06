import { DEFAULT_LANGUAGE, LANGUAGE_COOKIE, isSupportedLanguage, type Language } from "./config";
import { languageFromAcceptLanguage, matchLanguage, readCookie } from "./language";

/**
 * 화면 언어를 정한다(FR-149, research.md R22). 서버(root loader 등)에서만 쓴다.
 * (1) 로그인 회원의 언어 설정(`/me`의 `locale`) → (2) 쿠키 `lang`(하단 언어 선택) →
 * (3) `Accept-Language`(q 값 순서) → (4) 영어. 지원하지 않는 값은 건너뛴다.
 */
export function resolveLanguage(request: Request, memberLanguage?: string | null): Language {
  if (isSupportedLanguage(memberLanguage)) {
    return memberLanguage;
  }
  const fromCookie = matchLanguage(readCookie(request.headers.get("cookie"), LANGUAGE_COOKIE));
  return (
    fromCookie ??
    languageFromAcceptLanguage(request.headers.get("accept-language")) ??
    DEFAULT_LANGUAGE
  );
}
