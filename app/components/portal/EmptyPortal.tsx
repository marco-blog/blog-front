import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** 포털 영역이 모두 비었을 때(003 Edge Cases): 로그인 회원은 글쓰기, 아니면 가입 */
export function EmptyPortal({ loggedIn }: { loggedIn: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="portal-empty">
      <p>{t("portal:home.emptyTitle")}</p>
      <p>
        {loggedIn ? (
          <Link to="/write">{t("portal:home.emptyWrite")}</Link>
        ) : (
          <Link to="/signup">{t("portal:home.emptySignup")}</Link>
        )}
      </p>
    </section>
  );
}
