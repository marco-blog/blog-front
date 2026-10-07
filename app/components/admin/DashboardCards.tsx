import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { AdminDashboard } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

/** 처리 대기 신고 카드가 가리키는 화면(005) */
export const REPORTS_PATH = "/admin/reports";

/**
 * 콘솔 대시보드 카드(006 FR-103): 오늘(가입·발행 글·댓글), 전체(회원·블로그·공개 글), 처리 대기 신고.
 * `pendingReports`가 null이면(신고 기능 연결 전) 신고 카드를 그리지 않는다.
 */
export function DashboardCards({ dashboard }: { dashboard: AdminDashboard }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const card = (key: string, value: number) => (
    <li className="dashboard-card" key={key}>
      <span>{t(`admin:dashboard.cards.${key}`)}</span>
      <strong>{format.number(value)}</strong>
    </li>
  );
  return (
    <>
      <section aria-labelledby="dashboard-today">
        <h2 id="dashboard-today">{t("admin:dashboard.today")}</h2>
        <ul className="dashboard-cards">
          {card("signups", dashboard.today.signups)}
          {card("publishedPosts", dashboard.today.publishedPosts)}
          {card("comments", dashboard.today.comments)}
        </ul>
      </section>
      <section aria-labelledby="dashboard-totals">
        <h2 id="dashboard-totals">{t("admin:dashboard.totals")}</h2>
        <ul className="dashboard-cards">
          {card("members", dashboard.totals.members)}
          {card("blogs", dashboard.totals.blogs)}
          {card("publicPosts", dashboard.totals.publicPosts)}
          {dashboard.pendingReports !== null && (
            <li className="dashboard-card" key="pendingReports">
              <Link to={REPORTS_PATH}>{t("admin:dashboard.cards.pendingReports")}</Link>
              <strong>{format.number(dashboard.pendingReports)}</strong>
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
