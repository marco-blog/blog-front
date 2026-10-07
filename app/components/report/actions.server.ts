import { data, redirect } from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";
import { VALIDATION_FAILED, toFormError } from "~/api/formErrors";
import type { ApiFieldError } from "~/api/types";
import { loginPath } from "~/auth/paths";
import { reportFieldErrors } from "~/moderation/reasons";
import { isReportFormType, reportKey } from "~/moderation/reportTarget";

import { REPORT_INTENT, type ReportActionData } from "./actions";

/**
 * 신고(`intent=report`, 005 FR-040): 글 상세·방명록 화면의 action이 넘긴다. 폼은 `targetType`·`targetId`·`reason`·`detail`.
 * 미리 검사(사유, 기타면 설명, 1000자) 뒤 `POST /reports`. 로그인이 필요하면(401) 신고 폼이 열린 이 화면으로 돌아오는 로그인
 * 화면으로 보낸다. 그 밖의 오류(REPORT_ALREADY_EXISTS·REPORT_TARGET_NOT_FOUND·429 등)는 폼 오류로 돌려준다.
 */
export async function runReportAction(request: Request, options: { returnTo: string }) {
  const form = await request.formData();
  const targetType = String(form.get("targetType") ?? "");
  const targetId = Number(form.get("targetId") ?? "");
  if (!isReportFormType(targetType) || !Number.isSafeInteger(targetId) || targetId <= 0) {
    return invalid("", [{ field: "targetType", code: "INVALID" }]);
  }
  const key = reportKey(targetType, targetId);
  const reason = String(form.get("reason") ?? "");
  const detail = String(form.get("detail") ?? "").trim();
  const errors = reportFieldErrors(reason, detail);
  if (errors.length > 0) {
    return invalid(key, errors);
  }
  try {
    await createApiClient(request).post("/reports", {
      body: { targetType, targetId, reason, ...(detail ? { detail } : {}) },
    });
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      throw redirect(loginPath(withReportParam(options.returnTo, key)));
    }
    const { data: formError, status } = toFormError(error);
    return data<ReportActionData>(
      { ...formError, intent: REPORT_INTENT, ok: false, key },
      { status },
    );
  }
  return data<ReportActionData>({ intent: REPORT_INTENT, ok: true, key });
}

/** 돌아올 주소에 `?report={key}`를 붙인다(로그인 뒤 신고 폼을 열어 둔다) */
export function withReportParam(path: string, key: string): string {
  const url = new URL(path, "http://same-site.invalid");
  url.searchParams.set("report", key);
  return `${url.pathname}${url.search}`;
}

function invalid(key: string, fieldErrors: ApiFieldError[]) {
  return data<ReportActionData>(
    {
      intent: REPORT_INTENT,
      ok: false,
      key,
      resultCode: VALIDATION_FAILED,
      field: null,
      fieldErrors,
    },
    { status: 400 },
  );
}
