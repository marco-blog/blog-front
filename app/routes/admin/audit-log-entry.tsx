import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { adminNotFound, requireAdmin, throwAdminError } from "~/admin/access.server";
import { AUDIT_PATH } from "~/admin/auditFilters";
import { isSuperAdmin } from "~/admin/roles";
import { createApiClient } from "~/api/client.server";
import type { AuditLogEntry } from "~/api/models";
import { AuditTarget, useAuditNames } from "~/components/admin/AuditLogTable";
import { JsonDiff } from "~/components/admin/JsonDiff";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/audit-log-entry";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("audit:title"), t("appName"));
}

/**
 * 작업 기록 하나(`/admin/audit-log/:id`, 006 T053): 변경 전후 값과 요청 IP. 요청 IP는 backend가 최고 관리자에게만 복호화해
 * 주므로, 일반 관리자에게는 "최고 관리자만 볼 수 있습니다" 안내를 보인다. 없는 기록은 404.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!/^\d{1,18}$/.test(params.id ?? "")) {
    throw adminNotFound();
  }
  const entry = await createApiClient(request)
    .get<AuditLogEntry>(`/admin/audit-logs/${params.id}`)
    .catch(throwAdminError);
  return { entry, canSeeIp: isSuperAdmin(user.role) };
}

export default function AdminAuditLogEntry() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const names = useAuditNames();
  const { entry, canSeeIp } = useLoaderData<typeof loader>();
  return (
    <main className="admin-audit-entry">
      <h1>{t("audit:detail.title", { id: entry.id })}</h1>
      <dl>
        <dt>{t("audit:columns.createdAt")}</dt>
        <dd>
          <time dateTime={entry.createdAt}>{format.dateTime(entry.createdAt)}</time>
        </dd>
        <dt>{t("audit:columns.admin")}</dt>
        <dd>{entry.admin.nickname}</dd>
        <dt>{t("audit:columns.action")}</dt>
        <dd>{names.action(entry.action)}</dd>
        <dt>{t("audit:columns.target")}</dt>
        <dd>
          <AuditTarget entry={entry} />
        </dd>
        {entry.reason && (
          <>
            <dt>{t("audit:columns.reason")}</dt>
            <dd>{entry.reason}</dd>
          </>
        )}
        <dt>{t("audit:detail.requestIp")}</dt>
        <dd>
          {!canSeeIp
            ? t("audit:detail.requestIpHidden")
            : (entry.requestIp ?? t("audit:detail.requestIpMissing"))}
        </dd>
      </dl>
      <h2>{t("audit:changes")}</h2>
      <JsonDiff before={entry.before} after={entry.after} />
      <p>
        <Link to={AUDIT_PATH}>{t("audit:detail.back")}</Link>
      </p>
    </main>
  );
}
