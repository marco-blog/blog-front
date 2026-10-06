import { createInstance, type i18n, type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_NAMESPACE,
  FALLBACK_LANGUAGES,
  SUPPORTED_LANGUAGES,
  type Language,
} from "./config";

/**
 * 요청(서버)·화면(브라우저)마다 따로 쓰는 i18next 인스턴스를 만든다.
 * 리소스를 직접 넘기므로 초기화는 동기로 끝난다.
 */
export function createI18n(language: Language, resources: Resource): i18n {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: language,
    resources,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    fallbackLng: FALLBACK_LANGUAGES,
    load: "currentOnly",
    ns: Object.keys(resources[language] ?? {}),
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: false,
    returnEmptyString: false,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
