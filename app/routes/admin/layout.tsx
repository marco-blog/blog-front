import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLoaderData } from "react-router";

import { requireAdmin } from "~/admin/access.server";
import { ADMIN_MENU } from "~/admin/links";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/layout";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:title"), t("appName"));
}

/**
 * 시스템 관리자 콘솔 레이아웃(`/admin/**`, 003 T100): 로그인한 관리자만(아니면 404), 좌측 메뉴는 003의 4개.
 * 각 화면의 meta가 noindex를 넣는다(`privatePageMeta`).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  return { nickname: user.nickname };
}

export default function AdminLayout() {
  const { t } = useTranslation();
  const { nickname } = useLoaderData<typeof loader>();
  return (
    <div className="admin">
      <header className="admin-header">
        <p className="admin-title">
          {t("admin:title")} · <strong>{nickname}</strong>
        </p>
      </header>
      <nav aria-label={t("admin:nav.label")} className="admin-menu">
        <ul>
          {ADMIN_MENU.map((item) => (
            <li key={item.key}>
              <NavLink to={item.path}>{t(`admin:nav.${item.key}`)}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}
