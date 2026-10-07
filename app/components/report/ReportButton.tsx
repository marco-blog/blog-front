import { useTranslation } from "react-i18next";
import { useActionData, useLocation } from "react-router";

import { reportKey, type ReportFormType } from "~/moderation/reportTarget";

import { isReportResult } from "./actions";
import { ReportDialog } from "./ReportDialog";

/**
 * "신고" 버튼(005 FR-040). 로그인 회원이 남의 콘텐츠를 볼 때만 화면이 그린다(그 판단은 부르는 쪽).
 * `<details>`라 JS 없이도 열리고, `?report={type}-{id}`로 들어오거나(로그인 후 돌아옴) 이 대상의 action 결과가 있으면
 * 열어 둔다. 결과는 화면 action(`intent=report`)이 돌려준 값에서 `key`가 같은 것만 쓴다.
 * 007 포털 외부 카드는 `label`("삭제 요청")과 권리 침해 신고에 채울 주소 `rightsPath`를 넘긴다.
 */
export function ReportButton({
  type,
  id,
  label,
  rightsPath,
}: {
  type: ReportFormType;
  id: number;
  label?: string;
  rightsPath?: string;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const actionData = useActionData();
  const key = reportKey(type, id);
  const result = isReportResult(actionData) && actionData.key === key ? actionData : undefined;
  const open = result !== undefined || new URLSearchParams(location.search).get("report") === key;
  return (
    <details className="report" open={open || undefined}>
      <summary>{label ?? t("report:button")}</summary>
      <ReportDialog type={type} id={id} result={result} rightsPath={rightsPath} />
    </details>
  );
}
