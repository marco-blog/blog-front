import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLoaderData } from "react-router";

import { requireAdmin } from "~/admin/access.server";
import { ADMIN_MENU, ADMIN_REPORTS_MENU_KEY } from "~/admin/links";
import { createApiClient } from "~/api/client.server";
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
  // 005 "신고 관리" 배지. 읽지 못하면 배지 없이 그린다(각 화면이 권한·오류를 따로 처리한다).
  const summary = await createApiClient(request)
    .get<{ pendingCount: number }>("/admin/reports/summary")
    .catch(() => null);
  return { nickname: user.nickname, pendingReports: summary?.pendingCount ?? 0 };
}

export default function AdminLayout() {
  const { t } = useTranslation();
  const { nickname, pendingReports } = useLoaderData<typeof loader>();
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
              <NavLink to={item.path}>
                {t(`admin:nav.${item.key}`)}
                {item.key === ADMIN_REPORTS_MENU_KEY && pendingReports > 0 && (
                  <>
                    {" "}
                    <span className="badge">
                      {t("admin:nav.pending", { count: pendingReports })}
                    </span>
                  </>
                )}
              </NavLink>
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
