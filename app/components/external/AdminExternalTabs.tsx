import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

/**
 * 외부 블로그 관리 하위 탭(007 contracts/routes.md). `available`이 false인 탭은 화면이 생기기 전이라 숨긴다(그 단계가 켠다).
 */
export const ADMIN_EXTERNAL_TABS = [
  { key: "blogs", path: "/admin/external-blogs", available: true },
  { key: "reviews", path: "/admin/external-blogs/reviews", available: true },
  { key: "stats", path: "/admin/external-blogs/stats", available: true },
  { key: "rules", path: "/admin/external-blogs/rules", available: true },
  { key: "settings", path: "/admin/external-blogs/settings", available: true },
] as const;

export function AdminExternalTabs() {
  const { t } = useTranslation();
  return (
    <nav className="admin-tabs" aria-label={t("external:admin.tabs.label")}>
      <ul>
        {ADMIN_EXTERNAL_TABS.filter((tab) => tab.available).map((tab) => (
          <li key={tab.key}>
            <NavLink to={tab.path} end={tab.key === "blogs"}>
              {t(`external:admin.tabs.${tab.key}`)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
