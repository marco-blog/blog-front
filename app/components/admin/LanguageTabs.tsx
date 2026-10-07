import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { LANGUAGE_NAMES, isSupportedLanguage } from "~/i18n/config";

/** 언어 이름(자기 언어로, `LANGUAGE_NAMES`). 모르는 코드는 그대로 */
export function languageName(lang: string): string {
  return isSupportedLanguage(lang) ? LANGUAGE_NAMES[lang] : lang;
}

export const panelId = (lang: string) => `lang-${lang}`;

/**
 * 언어판 탭(006 T062). JS 없이는 위쪽 앵커 목록 + 언어별 `<details>`(펼친 채로 열 언어는 `open`)로 동작하고,
 * JS가 있으면 앵커를 누를 때 그 언어 칸을 펼치고 그 자리로 옮긴다.
 */
export function LanguageTabs({
  languages,
  openLanguages,
  label,
  children,
}: {
  languages: readonly string[];
  /** 처음부터 펼쳐 둘 언어 */
  openLanguages: readonly string[];
  label: string;
  children: (lang: string) => ReactNode;
}) {
  const { t } = useTranslation();
  const select = (lang: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    const panel = document.getElementById(panelId(lang));
    if (panel instanceof HTMLDetailsElement) {
      event.preventDefault();
      panel.open = true;
      panel.scrollIntoView?.({ block: "nearest" });
      panel.querySelector<HTMLElement>("input, textarea")?.focus();
    }
  };
  return (
    <div className="language-tabs">
      <nav aria-label={label}>
        <ul>
          {languages.map((lang) => (
            <li key={lang}>
              <a href={`#${panelId(lang)}`} onClick={select(lang)}>
                {languageName(lang)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {languages.map((lang) => (
        <details key={lang} id={panelId(lang)} open={openLanguages.includes(lang)}>
          <summary>
            {languageName(lang)}
            {lang === "ko" && ` (${t("admin:releaseNotes.editor.required")})`}
          </summary>
          {children(lang)}
        </details>
      ))}
    </div>
  );
}
