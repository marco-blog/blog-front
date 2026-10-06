import type { Resource, ResourceLanguage } from "i18next";

import {
  BASE_LANGUAGE,
  FALLBACK_LANGUAGES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  type Language,
} from "./config";

/**
 * app/locales/{lang}/{namespace}.json 전체. 서버에서만 불러오고,
 * 브라우저에는 root loader가 화면 언어와 대체 언어분만 넘긴다(hydration 시 깜빡임 방지).
 */
const modules = import.meta.glob<ResourceLanguage[string]>("../locales/*/*.json", {
  eager: true,
  import: "default",
});

function collect(): Record<Language, ResourceLanguage> {
  const result = Object.fromEntries(
    SUPPORTED_LANGUAGES.map((language) => [language, {} as ResourceLanguage]),
  ) as Record<Language, ResourceLanguage>;
  for (const [path, messages] of Object.entries(modules)) {
    const match = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
    if (match && isSupportedLanguage(match[1])) {
      result[match[1]][match[2]] = messages;
    }
  }
  return result;
}

export const allResources: Record<Language, ResourceLanguage> = collect();

/** 기준 언어(ko)에 있는 네임스페이스 목록 */
export const namespaces: string[] = Object.keys(allResources[BASE_LANGUAGE]).sort();

/** 화면 언어와 대체 언어(en, ko)의 리소스만 고른다. */
export function resourcesFor(language: Language): Resource {
  const languages = new Set<Language>([language, ...FALLBACK_LANGUAGES]);
  return Object.fromEntries([...languages].map((lng) => [lng, allResources[lng]]));
}
