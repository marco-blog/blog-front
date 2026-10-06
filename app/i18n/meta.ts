import type { TFunction } from "i18next";

import { DEFAULT_LANGUAGE, isSupportedLanguage } from "./config";
import { createI18n } from "./instance";
import type { RootLoaderData } from "./root-data";

interface MatchLike {
  id: string;
  loaderData?: unknown;
}

function isRootLoaderData(value: unknown): value is RootLoaderData {
  return (
    typeof value === "object" &&
    value !== null &&
    isSupportedLanguage((value as RootLoaderData).language) &&
    typeof (value as RootLoaderData).resources === "object"
  );
}

/**
 * 라우트 `meta`에서 쓰는 번역 함수. meta는 컴포넌트 밖에서 실행되므로
 * root loader가 넘긴 언어·리소스로 별도 인스턴스를 만든다.
 */
export function metaT(matches: ReadonlyArray<MatchLike | undefined>): TFunction {
  const data = matches.find((match) => match?.id === "root")?.loaderData;
  const i18n = isRootLoaderData(data)
    ? createI18n(data.language, data.resources)
    : createI18n(DEFAULT_LANGUAGE, {});
  return i18n.t;
}
