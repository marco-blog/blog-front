import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { LanguageSelector } from "./LanguageSelector";

/** 공통 하단. 이용약관·개인정보처리방침 링크(FR-137)와 언어 선택(FR-150). */
export function Footer() {
  const { t } = useTranslation();
  return (
    <footer>
      <nav aria-label={t("footer.label")}>
        <Link to="/terms">{t("footer.terms")}</Link>{" "}
        <Link to="/privacy">{t("footer.privacy")}</Link>
      </nav>
      <LanguageSelector />
    </footer>
  );
}
