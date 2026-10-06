/** 지원 언어(헌법 원칙 VII). 순서는 언어 선택 목록 순서다. */
export const SUPPORTED_LANGUAGES = ["ko", "en", "ja", "zh-CN"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** 번역 기준 언어. 새 키는 먼저 여기에 넣고, 누락 점검은 이 언어의 키 집합을 기준으로 한다. */
export const BASE_LANGUAGE: Language = "ko";

/** 회원 설정·쿠키·브라우저 언어로 정하지 못했을 때 쓰는 언어(FR-149 (4)). */
export const DEFAULT_LANGUAGE: Language = "en";

/** 번역이 빠진 문구는 영어, 영어도 없으면 한국어로 보여준다(FR-152). */
export const FALLBACK_LANGUAGES: Language[] = ["en", "ko"];

/** 방문자가 고른 언어를 기억하는 쿠키(FR-149 (2), research.md R22). */
export const LANGUAGE_COOKIE = "lang";

export const DEFAULT_NAMESPACE = "common";

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
