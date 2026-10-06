import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** 상단에 보여줄 로그인 회원 정보(root loader가 /me에서 골라 넘긴다) */
export interface HeaderUser {
  userId: number;
  nickname: string;
  role: string;
}

export interface HeaderProps {
  user: HeaderUser | null;
}

/**
 * 공통 상단. 비로그인은 로그인·회원가입, 로그인은 글쓰기·내 블로그 관리·설정·로그아웃.
 * 로그아웃은 JS 없이도 동작하도록 `/logout` action으로 폼 전송한다(US1에서 구현).
 */
export function Header({ user }: HeaderProps) {
  const { t } = useTranslation();
  return (
    <header>
      <Link to="/">{t("appName")}</Link>
      <nav aria-label={t("nav.label")}>
        {user ? (
          <ul>
            <li>
              <Link to="/write">{t("nav.write")}</Link>
            </li>
            <li>
              <Link to="/manage">{t("nav.manage")}</Link>
            </li>
            <li>
              <Link to="/settings">{t("nav.settings")}</Link>
            </li>
            <li>
              <form method="post" action="/logout">
                <button type="submit">{t("nav.logout")}</button>
              </form>
            </li>
          </ul>
        ) : (
          <ul>
            <li>
              <Link to="/login">{t("nav.login")}</Link>
            </li>
            <li>
              <Link to="/signup">{t("nav.signup")}</Link>
            </li>
          </ul>
        )}
      </nav>
    </header>
  );
}
