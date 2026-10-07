import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { ReportReason } from "~/api/models";
import { REPORT_REASONS } from "~/moderation/reasons";

/** 신고 사유 라디오(문구 `report:reasons.*`). 권리 침해 화면은 `reasons`로 4개만 */
export function ReasonSelect({
  reasons = REPORT_REASONS,
  legend,
  defaultValue,
  error,
}: {
  reasons?: readonly ReportReason[];
  legend?: string;
  defaultValue?: string;
  error?: string;
}) {
  const { t } = useTranslation();
  const errorId = useId();
  return (
    <fieldset
      className="report-reasons"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
    >
      <legend>{legend ?? t("report:dialog.reason")}</legend>
      {reasons.map((reason) => (
        <label key={reason} className="report-reason">
          <input
            type="radio"
            name="reason"
            value={reason}
            required
            defaultChecked={defaultValue === reason}
          />{" "}
          {t(`report:reasons.${reason}`)}
        </label>
      ))}
      {error && (
        <p id={errorId} className="form-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
