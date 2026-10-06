import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** 상단에 보여줄 로그인 회원 정보(root loader가 /me에서 골라 넘긴다) */
export interface HeaderUser {
  userId: number;
  nickname: string;
  role: string;
  /** 내 블로그 주소(삭제하지 않은 것). 내 블로그 화면에서 구독 버튼을 숨기는 데 쓴다(002). */
  blogs?: string[];
  /** 안 읽은 알림 수(002 FR-033) */
  unreadNotificationCount?: number;
}

export interface HeaderProps {
  user: HeaderUser | null;
}

/** 배지에 보여줄 안 읽은 알림 수. 0이면 null(배지 없음), 100 이상은 "99+" */
export function unreadBadge(count: number | undefined): string | null {
  if (!count || count <= 0) {
    return null;
  }
  return count >= 100 ? "99+" : String(count);
}

/**
 * 공통 상단. 비로그인은 로그인·회원가입, 로그인은 구독 피드·알림(안 읽은 수 배지)·글쓰기·내 블로그 관리·설정·로그아웃.
 * 로그아웃은 JS 없이도 동작하도록 `/logout` action으로 폼 전송한다(US1에서 구현).
 */
export function Header({ user }: HeaderProps) {
  const { t } = useTranslation();
  const badge = unreadBadge(user?.unreadNotificationCount);
  return (
    <header>
      <Link to="/">{t("appName")}</Link>
      <nav aria-label={t("nav.label")}>
        {user ? (
          <ul>
            <li>
              <Link to="/feed">{t("nav.feed")}</Link>
            </li>
            <li>
              <Link to="/notifications">
                {t("nav.notifications")}
                {badge && (
                  <>
                    {" "}
                    <span
                      className="badge"
                      aria-label={t("nav.unreadNotifications", {
                        count: user.unreadNotificationCount,
                      })}
                    >
                      {badge}
                    </span>
                  </>
                )}
              </Link>
            </li>
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
