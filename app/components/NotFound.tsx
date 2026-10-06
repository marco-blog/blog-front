import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** 404 화면. 없는 주소, 볼 권한이 없는 자원 모두 이 화면을 쓴다(헌법 원칙 IV). */
export function NotFound() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.description")}</p>
      <p>
        <Link to="/">{t("notFound.backHome")}</Link>
      </p>
    </main>
  );
}
