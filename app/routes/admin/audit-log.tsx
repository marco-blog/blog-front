import { useTranslation } from "react-i18next";
import { Form, Link, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { AUDIT_ACTION_GROUPS, GROUP_PREFIX, ungroupedActions } from "~/admin/auditActions";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_PATH,
  auditHref,
  auditQuery,
  parseAuditFilters,
} from "~/admin/auditFilters";
import { createApiClient } from "~/api/client.server";
import { fieldErrorMessages } from "~/api/errorMessage";
import { isApiError } from "~/api/errors";
import type { AdminMember, AuditActionList, AuditLogEntry } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { AuditLogTable, useAuditNames } from "~/components/admin/AuditLogTable";
import { Pagination } from "~/components/Pagination";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/audit-log";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("audit:title"), t("appName"));
}

/**
 * 작업 기록(`/admin/audit-log`, 006 FR-106, T053): 필터(기간·관리자·작업 종류 묶음·대상)와 표. 관리자 선택지는
 * `GET /admin/admins`, 작업 종류·대상 종류 선택지는 `GET /admin/audit-logs/actions`. 기간 오류(400)는 폼 옆 문구로.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const filters = parseAuditFilters(new URL(request.url).searchParams);
  const api = createApiClient(request);
  const [choices, admins] = await Promise.all([
    api.get<AuditActionList>("/admin/audit-logs/actions"),
    api.get<AdminMember[]>("/admin/admins"),
  ]).catch(throwAdminError);
  let entries: AuditLogEntry[] | null = null;
  let totalCount = 0;
  let fieldErrors: ApiFieldError[] = [];
  try {
    const response = await api.send<AuditLogEntry[]>("/admin/audit-logs", {
      query: auditQuery(filters, choices.actions),
    });
    entries = response.result;
    totalCount = response.totalCount ?? response.result.length;
  } catch (error) {
    if (!(isApiError(error) && error.status === 400)) {
      throwAdminError(error);
    }
    fieldErrors = error.fieldErrors;
  }
  return { filters, choices, admins, entries, totalCount, fieldErrors };
}

export default function AdminAuditLog() {
  const { t } = useTranslation();
  const names = useAuditNames();
  const { filters, choices, admins, entries, totalCount, fieldErrors } =
    useLoaderData<typeof loader>();
  const messages = fieldErrorMessages(t, fieldErrors);
  const error = (field: string) =>
    messages[field] ? <span className="field-error"> {messages[field]}</span> : null;
  const extra = ungroupedActions(choices.actions);
  return (
    <main className="admin-audit-log">
      <h1>{t("audit:title")}</h1>
      <p className="form-hint">{t("audit:hint")}</p>
      <Form
        method="get"
        role="search"
        aria-label={t("audit:filters.legend")}
        key={auditHref(filters)}
      >
        <fieldset>
          <legend>{t("audit:filters.legend")}</legend>
          <label>
            {t("audit:filters.from")} <input type="date" name="from" defaultValue={filters.from} />
            {error("from")}
          </label>{" "}
          <label>
            {t("audit:filters.to")} <input type="date" name="to" defaultValue={filters.to} />
            {error("to")}
          </label>{" "}
          <label>
            {t("audit:filters.admin")}{" "}
            <select name="adminId" defaultValue={filters.adminId}>
              <option value="">{t("audit:filters.allAdmins")}</option>
              {admins.map((admin) => (
                <option key={admin.userId} value={admin.userId}>
                  {admin.nickname}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            {t("audit:filters.action")}{" "}
            <select name="action" defaultValue={filters.action}>
              <option value="">{t("audit:filters.allActions")}</option>
              {AUDIT_ACTION_GROUPS.map((group) => (
                <optgroup key={group.group} label={t(`audit:groups.${group.group}`)}>
                  <option value={`${GROUP_PREFIX}${group.group}`}>
                    {t(`audit:groups.${group.group}`)} · {t("audit:filters.allActions")}
                  </option>
                  {group.actions
                    .filter((code) => choices.actions.includes(code))
                    .map((code) => (
                      <option key={code} value={code}>
                        {names.action(code)}
                      </option>
                    ))}
                </optgroup>
              ))}
              {extra.map((code) => (
                <option key={code} value={code}>
                  {names.action(code)}
                </option>
              ))}
            </select>
            {error("action")}
          </label>{" "}
          <label>
            {t("audit:filters.targetType")}{" "}
            <select name="targetType" defaultValue={filters.targetType}>
              <option value="">{t("audit:filters.allTargets")}</option>
              {choices.targetTypes.map((type) => (
                <option key={type} value={type}>
                  {names.target(type)}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            {t("audit:filters.targetId")}{" "}
            <input
              type="text"
              name="targetId"
              inputMode="numeric"
              pattern="\d*"
              defaultValue={filters.targetId}
            />
            {error("targetId")}
          </label>{" "}
          <label>
            {t("audit:filters.targetKey")}{" "}
            <input type="text" name="targetKey" maxLength={100} defaultValue={filters.targetKey} />
          </label>{" "}
          <button type="submit">{t("audit:filters.submit")}</button>{" "}
          <Link to={AUDIT_PATH}>{t("audit:filters.reset")}</Link>
        </fieldset>
        <p className="form-hint">{t("audit:filters.rangeHint")}</p>
      </Form>
      {fieldErrors.length > 0 && (
        <p role="alert" className="form-alert">
          {Object.values(messages).join(" ")}
        </p>
      )}
      {entries !== null &&
        (entries.length === 0 ? <p>{t("audit:empty")}</p> : <AuditLogTable entries={entries} />)}
      {entries !== null && (
        <Pagination
          page={filters.page}
          totalCount={totalCount}
          pageSize={AUDIT_PAGE_SIZE}
          hrefFor={(number) => auditHref(filters, number)}
        />
      )}
    </main>
  );
}
