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
      {/* 프로필·비밀번호·로그인 기록·언어 메뉴는 계정 설정(Phase 4)에서 더한다. */}
      <nav aria-label={t("settings:nav.label")}>
        <NavLink to="/settings/blogs">{t("settings:nav.blogs")}</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
