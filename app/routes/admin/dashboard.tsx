import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import type { AdminDashboard } from "~/api/models";
import { DashboardCards } from "~/components/admin/DashboardCards";
import { DailyBarChart } from "~/components/charts/DailyBarChart";
import { useRelativeTime } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/dashboard";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:title"), t("appName"));
}

/**
 * 콘솔 대시보드(`/admin`, 006 FR-103, T036): `GET /admin/dashboard`의 오늘·전체 수치, 처리 대기 신고, 최근 7일 막대.
 * 수치는 backend가 최대 5분 캐시하므로 "n분 전 기준"(서버 시각 `now` 기준 상대 시각)과 계산에 쓴 시간대를 보여준다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const dashboard = await createApiClient(request)
    .get<AdminDashboard>("/admin/dashboard")
    .catch(throwAdminError);
  return { dashboard, now: new Date().toISOString() };
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { dashboard, now } = useLoaderData<typeof loader>();
  const relative = useRelativeTime(now);
  return (
    <main className="admin-dashboard">
      <h1>{t("admin:dashboard.title")}</h1>
      <p className="form-hint">
        <time dateTime={dashboard.generatedAt}>
          {t("admin:dashboard.generatedAt", { time: relative(dashboard.generatedAt) })}
        </time>{" "}
        {t("admin:dashboard.timeZone", { timeZone: dashboard.timeZone })}
      </p>
      <DashboardCards dashboard={dashboard} />
      <section aria-labelledby="dashboard-trend">
        <h2 id="dashboard-trend">{t("admin:dashboard.trend")}</h2>
        <div className="table-scroll">
          <DailyBarChart
            caption={t("admin:dashboard.trendCaption", { count: dashboard.trend.length })}
            dateLabel={t("admin:dashboard.date")}
            series={[
              { key: "signups", label: t("admin:dashboard.signups") },
              { key: "publishedPosts", label: t("admin:dashboard.publishedPosts") },
            ]}
            rows={dashboard.trend}
          />
        </div>
      </section>
    </main>
  );
}
