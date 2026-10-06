import type { Resource } from "i18next";

import common from "~/locales/en/common.json";
import errors from "~/locales/en/errors.json";

/**
 * root loader 데이터가 없을 때(root loader 자체가 실패한 오류 화면) 쓰는 기본 언어(en) 리소스.
 * 키가 화면에 그대로 나오지 않도록 공통 틀과 오류 문구만 번들에 넣는다(research.md R22).
 */
export const FALLBACK_RESOURCES: Resource = { en: { common, errors } };
