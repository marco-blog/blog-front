import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

export interface BlogNavProps {
  handle: string;
  title: string;
  /** 방명록을 켠 블로그만 "방명록" 메뉴 */
  guestbookEnabled: boolean;
}

/** 공개 블로그 메뉴(004 FR-056·059·061): 홈·공지·방명록(켰을 때)·태그 */
export function BlogNav({ handle, title, guestbookEnabled }: BlogNavProps) {
  const { t } = useTranslation();
  const items = [
    { key: "home", to: `/${handle}`, end: true },
    { key: "notice", to: `/${handle}/notice`, end: false },
    ...(guestbookEnabled ? [{ key: "guestbook", to: `/${handle}/guestbook`, end: false }] : []),
    { key: "tags", to: `/${handle}/tags`, end: true },
  ] as const;
  return (
    <nav className="blog-nav" aria-label={t("blog:nav.label")}>
      <p className="blog-nav-title">
        <NavLink to={`/${handle}`} end>
          {title}
        </NavLink>
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.key}>
            <NavLink to={item.to} end={item.end}>
              {t(`blog:nav.${item.key}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
