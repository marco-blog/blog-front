import { useTranslation } from "react-i18next";

function languageName(code: string, display: string): string {
  try {
    return new Intl.DisplayNames([display], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** 요청한 언어판이 없어 다른 언어판(en → ko)을 보여줄 때의 안내(003 FR-160). 같으면 그리지 않는다. */
export function LanguageEditionNotice({ requested, shown }: { requested: string; shown: string }) {
  const { t, i18n } = useTranslation();
  if (requested === shown) {
    return null;
  }
  return (
    <p role="note" className="language-edition-notice" lang={i18n.language}>
      {t("updates:edition", {
        requested: languageName(requested, i18n.language),
        shown: languageName(shown, i18n.language),
      })}
    </p>
  );
}
