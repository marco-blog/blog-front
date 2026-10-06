import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

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
 * 상단 검색창(002 FR-035). 오류 화면에서도 그려지므로 라우터 폼이 아닌 일반 폼으로 `GET /search`에 보낸다(JS 없이 동작).
 * `/search` 화면에서는 지금 검색어를 채운다.
 */
export function HeaderSearch() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const q = pathname === "/search" ? (new URLSearchParams(search).get("q") ?? "") : "";
  return (
    <form method="get" action="/search" role="search" className="header-search">
      <input
        key={q}
        type="search"
        name="q"
        defaultValue={q}
        maxLength={100}
        aria-label={t("nav.searchLabel")}
      />
      <button type="submit">{t("nav.search")}</button>
    </form>
  );
}

/**
 * 공통 상단. 검색창, 비로그인은 로그인·회원가입, 로그인은 구독 피드·알림(안 읽은 수 배지)·글쓰기·내 블로그 관리·설정·로그아웃.
 * 로그아웃은 JS 없이도 동작하도록 `/logout` action으로 폼 전송한다(US1에서 구현).
 */
export function Header({ user }: HeaderProps) {
  const { t } = useTranslation();
  const badge = unreadBadge(user?.unreadNotificationCount);
  return (
    <header>
      <Link to="/">{t("appName")}</Link>
      <HeaderSearch />
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
