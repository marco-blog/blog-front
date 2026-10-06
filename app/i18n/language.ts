import {
  DEFAULT_LANGUAGE,
  LANGUAGE_COOKIE,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  type Language,
} from "./config";

/**
 * 언어 태그(BCP 47)를 지원 언어로 맞춘다. 맞는 것이 없으면 null.
 * 중국어는 간체(zh, zh-CN, zh-SG, zh-Hans*)만 zh-CN으로 본다. 번체(zh-TW, zh-HK, zh-Hant*)는 지원하지 않는다.
 */
export function matchLanguage(tag: string | null | undefined): Language | null {
  const normalized = tag?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const exact = SUPPORTED_LANGUAGES.find((language) => language.toLowerCase() === normalized);
  if (exact) {
    return exact;
  }
  const [primary, ...rest] = normalized.split(/[-_]/);
  if (primary === "zh") {
    if (rest.length === 0 || rest[0] === "cn" || rest[0] === "sg" || rest[0] === "hans") {
      return "zh-CN";
    }
    return null;
  }
  return SUPPORTED_LANGUAGES.find((language) => language === primary) ?? null;
}

/** Accept-Language 헤더에서 q 값이 높은 순서로 첫 번째 지원 언어를 고른다. */
export function languageFromAcceptLanguage(header: string | null | undefined): Language | null {
  if (!header) {
    return null;
  }
  const candidates = header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isNaN(q) ? 0 : q, index };
    })
    .filter((candidate) => candidate.tag && candidate.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const candidate of candidates) {
    const language = matchLanguage(candidate.tag);
    if (language) {
      return language;
    }
  }
  return null;
}

/** Cookie 헤더에서 이름이 같은 첫 값을 읽는다. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      const raw = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return null;
}

/**
 * 화면 언어를 정한다(FR-149, research.md R22).
 * (1) 로그인 회원의 언어 설정 → (2) 쿠키 `lang` → (3) Accept-Language → (4) 영어.
 * (1)은 로그인 기능(US1)에서 /me 응답으로 넘긴다.
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
