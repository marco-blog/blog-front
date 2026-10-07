import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { createApiClient } from "~/api/client.server";
import type { ReportDetail, ResolveReportResult } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { parsePostId } from "~/blog/ids";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { ReportTargetPreview } from "~/components/admin/ReportTargetPreview";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import {
  REPORTABLE_TYPES,
  hiddenContentPath,
  isReportableType,
  parseTargetUrl,
} from "~/moderation/reportTarget";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/report";

/** backend `Report.NOTE_MAX`, `SuspensionService.REASON_MAX`와 같다 */
export const NOTE_MAX = 1000;
export const SUSPEND_REASON_MAX = 500;
const INTENTS = ["target", "resolve", "unhide"] as const;
type Intent = (typeof INTENTS)[number];
/** 처리 버튼(`op`) → backend 결정·조치 */
const OPERATIONS = {
  HIDE: { decision: "ACTION", action: "HIDE_CONTENT" },
  SUSPEND: { decision: "ACTION", action: "SUSPEND_USER" },
  DISMISS: { decision: "DISMISS", action: null },
} as const;
type Operation = keyof typeof OPERATIONS;

type ReportActionResult = AdminActionData<{ resolvedCount?: number }>;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:report.title"), t("appName"));
}

/** 신고 상세(`/admin/reports/:id`, 005 T060): 같은 대상의 신고 목록, 권리 침해 정보, 대상 지정, 처리, 숨김 해제 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const id = parsePostId(params.id);
  if (id === null) {
    throw data(null, { status: 404 });
  }
  const report = await createApiClient(request)
    .get<ReportDetail>(`/admin/reports/${id}`)
    .catch(throwAdminError);
  return { report };
}

/**
 * - `intent=target`: 서비스 안 주소(또는 종류 + 번호)로 대상 지정 → PATCH /admin/reports/{id}/target
 * - `intent=resolve`: `op`=HIDE(숨김)·SUSPEND(작성자 정지, 사유 필수)·DISMISS(기각), 메모 → POST /admin/reports/{id}/resolve
 * - `intent=unhide`: 대상 숨김 해제 → DELETE /admin/contents/{type}/{id}/hidden
 */
export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const id = parsePostId(params.id);
  if (id === null) {
    throw data(null, { status: 404 });
  }
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  if (!(INTENTS as readonly string[]).includes(intentText)) {
    return adminInvalid(intentText);
  }
  const intent = intentText as Intent;
  const api = createApiClient(request);
  try {
    if (intent === "target") {
      const target = targetFrom(form);
      if (!target) {
        return adminInvalid(intent, [{ field: "targetUrl", code: "INVALID_FORMAT" }]);
      }
      await api.patch(`/admin/reports/${id}/target`, {
        body: { targetType: target.type, targetId: target.id },
      });
      return data<ReportActionResult>({ intent, ok: true });
    }
    if (intent === "unhide") {
      const type = String(form.get("targetType") ?? "");
      const targetId = parsePostId(String(form.get("targetId") ?? ""));
      if (!isReportableType(type) || targetId === null) {
        return adminInvalid(intent, [{ field: "targetType", code: "INVALID" }]);
      }
      await api.delete(hiddenContentPath(type, targetId));
      return data<ReportActionResult>({ intent, ok: true });
    }
    const op = String(form.get("op") ?? "");
    if (!(op in OPERATIONS)) {
      return adminInvalid(intent, [{ field: "decision", code: "INVALID" }]);
    }
    const { decision, action: reportAction } = OPERATIONS[op as Operation];
    const note = String(form.get("note") ?? "").trim();
    const suspendReason = String(form.get("suspendReason") ?? "").trim();
    const errors: ApiFieldError[] = [];
    if (note.length > NOTE_MAX) {
      errors.push({ field: "note", code: "TOO_LONG", params: { max: NOTE_MAX } });
    }
    if (op === "SUSPEND" && !suspendReason) {
      errors.push({ field: "suspendReason", code: "REQUIRED" });
    } else if (op === "SUSPEND" && suspendReason.length > SUSPEND_REASON_MAX) {
      errors.push({
        field: "suspendReason",
        code: "TOO_LONG",
        params: { max: SUSPEND_REASON_MAX },
      });
    }
    if (errors.length > 0) {
      return adminInvalid(intent, errors);
    }
    const result = await api.post<ResolveReportResult>(`/admin/reports/${id}/resolve`, {
      body: {
        decision,
        ...(reportAction ? { action: reportAction } : {}),
        ...(note ? { note } : {}),
        ...(op === "SUSPEND" ? { suspendReason } : {}),
      },
    });
    return data<ReportActionResult>({ intent, ok: true, resolvedCount: result.resolvedCount });
  } catch (error) {
    return adminActionError(intent, error);
  }
}

/** 대상 지정 폼: 주소가 있으면 주소를 해석하고, 없으면 종류 + 번호 */
function targetFrom(form: FormData) {
  const url = String(form.get("targetUrl") ?? "").trim();
  if (url) {
    return parseTargetUrl(url);
  }
  const type = String(form.get("targetType") ?? "");
  const id = parsePostId(String(form.get("targetId") ?? ""));
  return isReportableType(type) && id !== null ? { type, id } : null;
}

export default function AdminReport() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { report } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";
  const target = report.target;
  const pending = report.status === "PENDING";
  const confirmSuspend = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (
      submitter?.value === "SUSPEND" &&
      !window.confirm(t("admin:report.resolve.confirmSuspend"))
    ) {
      event.preventDefault();
    }
  };

  return (
    <main className="admin-report">
      <p>
        <Link to="/admin/reports">{t("admin:reports.title")}</Link>
      </p>
      <h1>{t("admin:report.title")}</h1>
      {result?.ok && (
        <p role="status">
          {result.intent === "resolve"
            ? t("admin:report.done.resolve", {
                count: (result as { resolvedCount?: number }).resolvedCount ?? 0,
              })
            : t(`admin:report.done.${result.intent}`)}
        </p>
      )}
      <AdminFormErrors error={result && !result.ok ? result : null} />

      <section aria-labelledby="report-target">
        <h2 id="report-target">{t("admin:report.target")}</h2>
        <ReportTargetPreview target={target} />
        {report.targetUserReportCount !== null && (
          <p>{t("admin:report.targetUserReportCount", { count: report.targetUserReportCount })}</p>
        )}
      </section>

      {report.channel === "RIGHTS_REQUEST" && (
        <section aria-labelledby="report-rights">
          <h2 id="report-rights">{t("admin:report.rights.title")}</h2>
          <dl>
            <dt>{t("admin:report.rights.targetUrl")}</dt>
            <dd>{report.targetUrl}</dd>
            <dt>{t("admin:report.rights.rightsBasis")}</dt>
            <dd style={{ whiteSpace: "pre-wrap" }}>{report.rightsBasis}</dd>
            <dt>{t("admin:report.rights.contactEmail")}</dt>
            <dd>{report.contactEmail ?? t("admin:report.rights.purged")}</dd>
          </dl>
        </section>
      )}

      {pending && target === null && (
        <Form method="post" className="report-assign">
          <fieldset>
            <legend>{t("admin:report.assign.legend")}</legend>
            <input type="hidden" name="intent" value="target" />
            <p className="form-hint">{t("admin:report.assign.hint")}</p>
            <label>
              {t("admin:report.assign.url")}{" "}
              <input name="targetUrl" defaultValue={report.targetUrl ?? ""} />
            </label>{" "}
            <label>
              {t("admin:report.assign.type")}{" "}
              <select name="targetType" defaultValue="POST">
                {REPORTABLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`admin:reports.targetTypes.${type}`)}
                  </option>
                ))}
              </select>
            </label>{" "}
            <label>
              {t("admin:report.assign.id")} <input name="targetId" inputMode="numeric" />
            </label>{" "}
            <button type="submit" disabled={submitting}>
              {t("admin:report.assign.submit")}
            </button>
          </fieldset>
        </Form>
      )}

      {pending ? (
        <Form method="post" className="report-resolve" onSubmit={confirmSuspend}>
          <fieldset>
            <legend>{t("admin:report.resolve.legend")}</legend>
            <input type="hidden" name="intent" value="resolve" />
            <label>
              {t("admin:report.resolve.note")}{" "}
              <textarea name="note" rows={2} maxLength={NOTE_MAX} />
            </label>
            <label>
              {t("admin:report.resolve.suspendReason")}{" "}
              <input name="suspendReason" maxLength={SUSPEND_REASON_MAX} />
            </label>
            <p>
              <button type="submit" name="op" value="HIDE" disabled={submitting}>
                {t("admin:report.resolve.hide")}
              </button>{" "}
              <button type="submit" name="op" value="SUSPEND" disabled={submitting}>
                {t("admin:report.resolve.suspend")}
              </button>{" "}
              <button type="submit" name="op" value="DISMISS" disabled={submitting}>
                {t("admin:report.resolve.dismiss")}
              </button>
            </p>
          </fieldset>
        </Form>
      ) : (
        <section aria-labelledby="report-result">
          <h2 id="report-result">{t("admin:report.result.title")}</h2>
          <p>
            {t(`admin:reports.status.${report.status}`)}
            {report.action && <> · {t(`admin:reports.action.${report.action}`)}</>}
          </p>
          {report.handledBy && (
            <p>
              {t("admin:report.result.handledBy", {
                nickname: report.handledBy.nickname,
                time: format.dateTime(report.handledAt),
              })}
            </p>
          )}
          {report.resolutionNote && (
            <p style={{ whiteSpace: "pre-wrap" }}>
              {t("admin:report.result.note")}: {report.resolutionNote}
            </p>
          )}
        </section>
      )}

      {target?.state === "HIDDEN" && isReportableType(target.type) && (
        <Form method="post" className="report-unhide">
          <input type="hidden" name="intent" value="unhide" />
          <input type="hidden" name="targetType" value={target.type} />
          <input type="hidden" name="targetId" value={target.id} />
          <button type="submit" disabled={submitting}>
            {t("admin:report.unhide")}
          </button>
        </Form>
      )}

      <section aria-labelledby="report-list">
        <h2 id="report-list">{t("admin:report.reports")}</h2>
        <ul className="report-items">
          {report.reports.map((item) => (
            <li key={item.id}>
              <p>
                <strong>
                  {item.reporter ? item.reporter.nickname : t("admin:report.rightsReporter")}
                </strong>{" "}
                · {t(`report:reasons.${item.reason}`)} ·{" "}
                <time dateTime={item.createdAt}>{format.dateTime(item.createdAt)}</time>
              </p>
              {item.detail && <p style={{ whiteSpace: "pre-wrap" }}>{item.detail}</p>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
