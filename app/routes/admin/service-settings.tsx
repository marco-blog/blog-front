import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { formatBytes, formatDuration, parseIsoDuration } from "~/admin/format";
import { createApiClient } from "~/api/client.server";
import type { ServiceSettings } from "~/api/models";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/service-settings";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:serviceSettings.title"), t("appName"));
}

/** 서비스 설정(`/admin/settings`, 006 FR-160, T038): 읽기 전용 값과 각 값의 프로퍼티 이름. 입력·저장은 없다. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const settings = await createApiClient(request)
    .get<ServiceSettings>("/admin/service-settings")
    .catch(throwAdminError);
  return { settings };
}

export default function AdminServiceSettings() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { settings } = useLoaderData<typeof loader>();
  const cacheSeconds = parseIsoDuration(settings.admin.dashboardCacheTtl);
  const rows: [key: string, value: string, property: string][] = [
    ["termsVersion", settings.termsVersion, "blog.legal.terms-version"],
    [
      "defaultMaxPerMember",
      format.number(settings.blogs.defaultMaxPerMember),
      "blog.blogs.default-max-per-member",
    ],
    ["maxFileSize", formatBytes(settings.media.maxFileSize, i18n.language), "blog.media.max-size"],
    ["maxPixels", format.number(settings.media.maxPixels), "blog.media.max-pixels"],
    ["tempQuota", formatBytes(settings.media.tempQuota, i18n.language), "blog.media.temp-quota"],
    ["tempTtl", formatDuration(t, settings.media.tempTtl), "blog.media.temp-ttl"],
    ["allowedTypes", settings.media.allowedTypes.join(", "), "blog.media.allowed-types"],
    [
      "auditRetention",
      formatDuration(t, settings.admin.auditRetention),
      "blog.admin.audit-retention",
    ],
    [
      "dashboardCacheTtl",
      cacheSeconds === 0
        ? t("admin:serviceSettings.cacheOff")
        : formatDuration(t, settings.admin.dashboardCacheTtl),
      "blog.admin.dashboard-cache-ttl",
    ],
  ];
  return (
    <main className="admin-service-settings">
      <h1>{t("admin:serviceSettings.title")}</h1>
      <p className="form-hint">{t("admin:serviceSettings.hint")}</p>
      <div className="table-scroll">
        <table className="admin-table" aria-label={t("admin:serviceSettings.list")}>
          <thead>
            <tr>
              <th scope="col">{t("admin:serviceSettings.columns.item")}</th>
              <th scope="col">{t("admin:serviceSettings.columns.value")}</th>
              <th scope="col">{t("admin:serviceSettings.columns.property")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([key, value, property]) => (
              <tr key={key}>
                <th scope="row">{t(`admin:serviceSettings.items.${key}`)}</th>
                <td>{value}</td>
                <td>
                  <code>{property}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
