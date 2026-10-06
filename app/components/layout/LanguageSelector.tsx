import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, useLocation } from "react-router";

import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isSupportedLanguage } from "~/i18n/config";

/**
 * 하단 언어 선택(FR-150). `/locale` action으로 폼을 보내므로 JS 없이도 동작하고,
 * 같은 주소(언어 접두어 없음)로 돌아와 그 언어로 다시 그린다. JS가 있으면 고르자마자 보낸다.
 * 언어 이름은 각 언어의 자기 이름으로 보여준다(어느 화면 언어에서도 자기 언어를 찾을 수 있게).
 */
export function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const selectId = useId();
  const current = isSupportedLanguage(i18n.language) ? i18n.language : undefined;

  return (
    <Form method="post" action="/locale" className="language-selector">
      <input type="hidden" name="redirectTo" value={`${location.pathname}${location.search}`} />
      <label htmlFor={selectId}>{t("footer.language")}</label>{" "}
      <select
        id={selectId}
        name="lang"
        defaultValue={current}
        key={current}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>
            {LANGUAGE_NAMES[language]}
          </option>
        ))}
      </select>{" "}
      <button type="submit">{t("footer.changeLanguage")}</button>
    </Form>
  );
}
