import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useLocation, useNavigation } from "react-router";

import { useFormMessages } from "~/api/formErrors";
import { FormAlert } from "~/components/form/FormField";
import { REPORT_DETAIL_MAX } from "~/moderation/reasons";
import { rightsRequestHref, targetAnchor, type ReportFormType } from "~/moderation/reportTarget";

import { REPORT_INTENT, type ReportActionData } from "./actions";
import { ReasonSelect } from "./ReasonSelect";

/** 지금 주소에서 `?report=`만 뺀 주소(취소) */
function withoutReportParam(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  params.delete("report");
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}

/**
 * 신고 사유 레이어(005 contracts/routes.md "신고 레이어 공통"): 사유 8개 라디오, 설명(기타면 필수), "신고하기"·"취소",
 * 아래에 "회원이 아니신가요? 권리 침해 신고" 링크(지금 화면 주소 + 항목 앵커). 접수되면 "신고가 접수되었습니다".
 * `result`는 이 대상의 action 결과만 넘긴다. `rightsPath`가 있으면 권리 침해 신고에 그 주소를 채운다(007 외부 글).
 */
export function ReportDialog({
  type,
  id,
  result,
  rightsPath,
}: {
  type: ReportFormType;
  id: number;
  result?: ReportActionData;
  rightsPath?: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigation = useNavigation();
  const detailId = useId();
  const messages = useFormMessages(result && !result.ok ? result : null);
  const submitting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === REPORT_INTENT &&
    navigation.formData?.get("targetId") === String(id);
  const target = t(`report:targets.${type}`);
  const rightsLink = (
    <p className="report-rights">
      <Link to={rightsRequestHref(rightsPath ?? `${location.pathname}${targetAnchor(type, id)}`)}>
        {t("report:rightsLink")}
      </Link>
    </p>
  );

  if (result?.ok) {
    return (
      <div className="report-dialog">
        <p role="status">{t("report:done")}</p>
        {rightsLink}
      </div>
    );
  }
  return (
    <div className="report-dialog">
      <Form
        method="post"
        className="report-form"
        aria-label={t("report:dialog.title", { target })}
        preventScrollReset
      >
        <input type="hidden" name="intent" value={REPORT_INTENT} />
        <input type="hidden" name="targetType" value={type} />
        <input type="hidden" name="targetId" value={id} />
        <FormAlert message={messages.form} />
        <ReasonSelect error={messages.fields.reason} />
        <label htmlFor={detailId}>{t("report:dialog.detail")}</label>
        <textarea
          id={detailId}
          name="detail"
          rows={3}
          maxLength={REPORT_DETAIL_MAX}
          aria-describedby={`${detailId}-hint`}
          aria-invalid={messages.fields.detail ? true : undefined}
        />
        <p id={`${detailId}-hint`} className="field-hint">
          {messages.fields.detail ?? t("report:dialog.detailHint")}
        </p>
        <button type="submit" disabled={submitting}>
          {t("report:dialog.submit")}
        </button>{" "}
        <Link to={withoutReportParam(location.pathname, location.search)} preventScrollReset>
          {t("report:dialog.cancel")}
        </Link>
      </Form>
      {rightsLink}
    </div>
  );
}
