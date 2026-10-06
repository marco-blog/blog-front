import { useTranslation } from "react-i18next";
import { NavLink, Outlet } from "react-router";

import { requireUser } from "~/auth/session.server";

import type { Route } from "./+types/settings";

/** 계정 설정 레이아웃(`/settings/**`, 로그인 필요). 블로그 관리(`/:handle/manage`)와는 별개 화면이다. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

export default function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <div className="settings">
      <nav aria-label={t("settings:nav.label")}>
        <NavLink to="/settings/profile">{t("settings:nav.profile")}</NavLink>{" "}
        <NavLink to="/settings/password">{t("settings:nav.password")}</NavLink>{" "}
        <NavLink to="/settings/login-history">{t("settings:nav.loginHistory")}</NavLink>{" "}
        <NavLink to="/settings/blogs">{t("settings:nav.blogs")}</NavLink>{" "}
        <NavLink to="/settings/language">{t("settings:nav.language")}</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
