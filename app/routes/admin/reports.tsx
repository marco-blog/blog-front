import { useTranslation } from "react-i18next";
import { Form, Link, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import { REPORT_TARGET_TYPES, type ReportGroup, type ReportStatus } from "~/api/models";
import { parsePage } from "~/blog/listing";
import { ReportGroupTable } from "~/components/admin/ReportGroupTable";
import { Pagination } from "~/components/Pagination";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/reports";

export const REPORT_PAGE_SIZE = 20;
const PATH = "/admin/reports";
export const REPORT_STATUSES: readonly ReportStatus[] = ["PENDING", "ACTIONED", "DISMISSED"];

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:reports.title"), t("appName"));
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | null {
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : null;
}

/** 목록 주소(`?status=&targetType=&page=`). 기본값(대기, 전체, 1쪽)은 뺀다 */
export function reportsHref(status: ReportStatus, targetType: string | null, page = 1): string {
  const params = new URLSearchParams();
  if (status !== "PENDING") params.set("status", status);
  if (targetType) params.set("targetType", targetType);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${PATH}?${query}` : PATH;
}

/**
 * 신고 관리(`/admin/reports`, 005 T060, FR-041): 대기·조치·기각 탭, 대상 종류 거르기, 대상별 묶음 표. 행을 누르면 상세.
 * 모르는 상태·종류 값은 버린다(기본: 대기, 전체).
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const status = oneOf(REPORT_STATUSES, search.get("status")) ?? "PENDING";
  const targetType = oneOf(REPORT_TARGET_TYPES, search.get("targetType"));
  const page = parsePage(search.get("page"));
  const response = await createApiClient(request)
    .send<ReportGroup[]>("/admin/reports", {
      query: {
        status,
        ...(targetType ? { targetType } : {}),
        page: page - 1,
        size: REPORT_PAGE_SIZE,
      },
    })
    .catch(throwAdminError);
  return {
    status,
    targetType,
    page,
    groups: response.result,
    totalCount: response.totalCount ?? response.result.length,
  };
}

export default function AdminReports() {
  const { t } = useTranslation();
  const { status, targetType, page, groups, totalCount } = useLoaderData<typeof loader>();
  return (
    <main className="admin-reports">
      <h1>{t("admin:reports.title")}</h1>
      <nav aria-label={t("admin:reports.statusTabs")} className="tabs">
        <ul>
          {REPORT_STATUSES.map((item) => (
            <li key={item}>
              <Link
                to={reportsHref(item, targetType)}
                aria-current={item === status ? "page" : undefined}
              >
                {t(`admin:reports.status.${item}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Form method="get" className="report-filter">
        {status !== "PENDING" && <input type="hidden" name="status" value={status} />}
        <label>
          {t("admin:reports.targetType")}{" "}
          <select name="targetType" defaultValue={targetType ?? ""}>
            <option value="">{t("admin:reports.allTypes")}</option>
            {REPORT_TARGET_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`admin:reports.targetTypes.${type}`)}
              </option>
            ))}
          </select>
        </label>{" "}
        <button type="submit">{t("admin:reports.filter")}</button>
      </Form>
      {groups.length === 0 ? (
        <p>{t("admin:reports.empty")}</p>
      ) : (
        <ReportGroupTable groups={groups} />
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={REPORT_PAGE_SIZE}
        hrefFor={(number) => reportsHref(status, targetType, number)}
      />
    </main>
  );
}
