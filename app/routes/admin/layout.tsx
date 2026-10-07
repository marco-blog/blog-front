import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useLoaderData } from "react-router";

import { requireAdmin } from "~/admin/access.server";
import { ADMIN_HOME, ADMIN_REPORTS_MENU_KEY, adminMenuSections } from "~/admin/links";
import { createApiClient } from "~/api/client.server";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";
import consoleStyles from "~/styles/console.css?url";

import type { Route } from "./+types/layout";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: consoleStyles }];

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:title"), t("appName"));
}

/**
 * 시스템 관리자 콘솔 레이아웃(`/admin/**`, 003 T100 → 006 T013): 로그인한 관리자만(아니면 404).
 * 좌측 메뉴는 `ADMIN_MENU`의 `available` 항목을 묶음 제목(`admin:nav.groups.*`)과 함께, 머리글에 관리자 권한 이름.
 * 각 화면의 meta가 noindex를 넣는다(`privatePageMeta`).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  // 005 "신고 관리" 배지. 읽지 못하면 배지 없이 그린다(각 화면이 권한·오류를 따로 처리한다).
  const summary = await createApiClient(request)
    .get<{ pendingCount: number }>("/admin/reports/summary")
    .catch(() => null);
  return {
    nickname: user.nickname,
    role: user.role,
    pendingReports: summary?.pendingCount ?? 0,
  };
}

export default function AdminLayout() {
  const { t } = useTranslation();
  const { nickname, role, pendingReports } = useLoaderData<typeof loader>();
  return (
    <div className="admin">
      <header className="admin-header">
        <p className="admin-title">
          {t("admin:title")} · <strong>{nickname}</strong> ·{" "}
          <span className="admin-role">
            {t(`admin:users.role.${role}`, { defaultValue: role })}
          </span>
        </p>
      </header>
      {/* 좁은 화면에서는 접을 수 있는 메뉴(JS 없이 동작). 넓은 화면은 접기 제목을 CSS로 감춘다. */}
      <details className="console-menu" open>
        <summary>{t("admin:nav.menu")}</summary>
        <nav aria-label={t("admin:nav.label")} className="admin-menu">
          {/* 같은 묶음이 떨어져 두 번 나올 수 있어(운영 → 포털 → 운영) 키는 순번으로 만든다. */}
          {adminMenuSections().map((section, index) => (
            <section key={index} aria-labelledby={`admin-menu-${index}`}>
              <h2 id={`admin-menu-${index}`}>{t(`admin:nav.groups.${section.group}`)}</h2>
              <ul>
                {section.items.map((item) => (
                  <li key={item.key}>
                    <NavLink to={item.path} end={item.path === ADMIN_HOME}>
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
            </section>
          ))}
        </nav>
      </details>
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}
