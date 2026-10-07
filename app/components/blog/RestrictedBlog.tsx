import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/**
 * "이용이 제한된 블로그"(005 FR-042, contracts/routes.md): 주인이 정지된 블로그의 공개 화면. 블로그 메뉴·사이드바 없이 안내만.
 */
export function RestrictedBlog() {
  const { t } = useTranslation();
  return (
    <main className="restricted-blog">
      <h1>{t("moderation:restricted.title")}</h1>
      <p>{t("moderation:restricted.body")}</p>
      <p>
        <Link to="/">{t("notFound.backHome")}</Link>
      </p>
    </main>
  );
}
