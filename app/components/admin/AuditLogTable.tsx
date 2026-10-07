import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { AuditLogEntry } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

import { JsonDiff } from "./JsonDiff";

/** 작업 이름: `audit:actions.{CODE}`, 모르는 코드는 코드 그대로 */
export function useAuditNames() {
  const { t } = useTranslation();
  return {
    action: (code: string) => t(`audit:actions.${code}`, { defaultValue: code }),
    target: (type: string) => t(`audit:targets.${type}`, { defaultValue: type }),
  };
}

/** 대상 화면 주소(없으면 null): 회원 → 회원 상세(005), 릴리스 노트 → 편집, 주제 → 주제 관리, 신고 → 신고 상세(005) */
export function auditTargetHref(
  entry: Pick<AuditLogEntry, "targetType" | "targetId">,
): string | null {
  const id = entry.targetId;
  switch (entry.targetType) {
    case "USER":
      return id === null ? null : `/admin/users/${id}`;
    case "RELEASE_NOTE":
      return id === null ? null : `/admin/release-notes/${id}`;
    case "TOPIC":
      return "/admin/topics";
    case "REPORT":
      return id === null ? null : `/admin/reports/${id}`;
    case "CURATION":
      return "/admin/portal/curations";
    case "SETTING":
      return "/admin/portal/settings";
    default:
      return null;
  }
}

/** 대상 표시: "회원 #12" 또는 키("릴리스 노트 · portal.score-weights") */
export function AuditTarget({ entry }: { entry: AuditLogEntry }) {
  const names = useAuditNames();
  const label = [
    names.target(entry.targetType),
    entry.targetId !== null ? `#${entry.targetId}` : null,
    entry.targetKey,
  ]
    .filter(Boolean)
    .join(" ");
  const href = auditTargetHref(entry);
  return href ? <Link to={href}>{label}</Link> : <>{label}</>;
}

/**
 * 작업 기록 표(006 T053): 시각·관리자·작업 이름·대상(링크)·사유, 행 아래 `<details>`로 변경 전후 값(`JsonDiff`)과 상세 링크.
 * 기록마다 `<tbody>` 하나(요약 줄 + 펼침 줄)라 `<details>`가 JS 없이 행마다 펼쳐진다.
 */
export function AuditLogTable({ entries }: { entries: readonly AuditLogEntry[] }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const names = useAuditNames();
  return (
    <div className="table-scroll">
      <table className="admin-table audit-table" aria-label={t("audit:list")}>
        <thead>
          <tr>
            <th scope="col">{t("audit:columns.createdAt")}</th>
            <th scope="col">{t("audit:columns.admin")}</th>
            <th scope="col">{t("audit:columns.action")}</th>
            <th scope="col">{t("audit:columns.target")}</th>
            <th scope="col">{t("audit:columns.reason")}</th>
          </tr>
        </thead>
        {entries.map((entry) => (
          <tbody key={entry.id}>
            <tr>
              <td>
                <time dateTime={entry.createdAt}>{format.dateTime(entry.createdAt)}</time>
              </td>
              <td>{entry.admin.nickname}</td>
              <td>{names.action(entry.action)}</td>
              <td>
                <AuditTarget entry={entry} />
              </td>
              <td>{entry.reason ?? ""}</td>
            </tr>
            <tr>
              <td colSpan={5}>
                <details>
                  <summary>{t("audit:changes")}</summary>
                  <JsonDiff before={entry.before} after={entry.after} />
                  <p>
                    <Link to={`/admin/audit-log/${entry.id}`}>{t("audit:detailLink")}</Link>
                  </p>
                </details>
              </td>
            </tr>
          </tbody>
        ))}
      </table>
    </div>
  );
}
