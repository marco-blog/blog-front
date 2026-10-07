import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { ReportGroup } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

import { ReportTargetPreview } from "./ReportTargetPreview";

/**
 * 신고 묶음 표(005 `/admin/reports`): 대상 미리보기, 신고 수, 사유별 수, 첫 접수, 처리 결과. 행의 "신고 N건"을 누르면 상세.
 * 권리 침해 신고가 섞인 묶음은 "권리 침해" 표시, 대상 미정은 "대상 미정".
 */
export function ReportGroupTable({ groups }: { groups: ReportGroup[] }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  return (
    <table className="admin-table report-groups" aria-label={t("admin:reports.list")}>
      <tbody>
        {groups.map((group) => (
          <tr key={group.representativeId}>
            <td>
              {group.channel !== "MEMBER" && (
                <p>
                  <span className="badge badge-rights">
                    {t(`admin:reports.channel.${group.channel}`)}
                  </span>
                </p>
              )}
              {group.target === null && group.targetType === null ? (
                <p>{t("admin:reports.untargeted")}</p>
              ) : (
                <ReportTargetPreview target={group.target} compact />
              )}
            </td>
            <td>
              <Link to={`/admin/reports/${group.representativeId}`}>
                {t("admin:reports.count", { count: group.reportCount })}
              </Link>
            </td>
            <td>
              <ul className="report-reason-counts">
                {group.reasons.map((item) => (
                  <li key={item.reason}>
                    {t(`report:reasons.${item.reason}`)} {item.count}
                  </li>
                ))}
              </ul>
            </td>
            <td>
              {t("admin:reports.firstReportedAt", { time: format.dateTime(group.firstReportedAt) })}
            </td>
            <td>
              {t(`admin:reports.status.${group.status}`)}
              {group.action && <> · {t(`admin:reports.action.${group.action}`)}</>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
