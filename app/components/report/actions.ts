import type { FormErrorData } from "~/api/formErrors";

/** 신고(`intent=report`) action 결과(직렬화 가능). `key`는 대상의 화면 열쇠(`comment-12`, reportTarget.ts) */
export type ReportActionData =
  | { intent: "report"; ok: true; key: string }
  | (FormErrorData & { intent: "report"; ok: false; key: string });

export const REPORT_INTENT = "report";

export function isReportResult(value: unknown): value is ReportActionData {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { intent?: unknown }).intent === REPORT_INTENT
  );
}
