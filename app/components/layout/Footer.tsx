import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/**
 * 공통 하단. 이용약관·개인정보처리방침 링크(FR-137)와 언어 선택 자리(FR-150).
 * 언어 선택 폼(LanguageSelector, `/locale` action)은 US5에서 이 자리에 넣는다.
 */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer>
      <nav aria-label={t("footer.label")}>
        <Link to="/terms">{t("footer.terms")}</Link>{" "}
        <Link to="/privacy">{t("footer.privacy")}</Link>
      </nav>
      <div role="group" aria-label={t("footer.language")}>
        {t("languageName")}
      </div>
    </footer>
  );
}
