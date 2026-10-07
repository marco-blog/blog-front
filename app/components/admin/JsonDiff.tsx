import { useTranslation } from "react-i18next";

type JsonObject = Record<string, unknown> | null | undefined;

export interface DiffRow {
  field: string;
  before: string | null;
  after: string | null;
  same: boolean;
}

/** 값 하나를 보여줄 문자열로(문자열은 그대로, 나머지는 JSON). 없는 키는 null */
function show(object: JsonObject, key: string): string | null {
  if (!object || !(key in object)) {
    return null;
  }
  const value = object[key];
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** 변경 전후 객체의 키별 비교(앞 객체의 키 순서, 뒤에만 있는 키는 그 뒤) */
export function diffRows(before: JsonObject, after: JsonObject): DiffRow[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys.map((field) => {
    const left = show(before, field);
    const right = show(after, field);
    return { field, before: left, after: right, same: left === right };
  });
}

/**
 * 작업 기록의 변경 전·후 값 비교(006 FR-106, T053). 키마다 한 줄, 같은 값은 흐리게(`same`) 표시하고 "같음"을 덧붙인다.
 * 기록에는 바뀐 필드만 있고 개인정보 평문은 없다(backend).
 */
export function JsonDiff({ before, after }: { before: JsonObject; after: JsonObject }) {
  const { t } = useTranslation();
  const rows = diffRows(before, after);
  if (rows.length === 0) {
    return <p>{t("audit:noChanges")}</p>;
  }
  const value = (text: string | null) =>
    text === null ? t("audit:diff.none") : <code>{text}</code>;
  return (
    <div className="table-scroll">
      <table className="json-diff">
        <thead>
          <tr>
            <th scope="col">{t("audit:diff.field")}</th>
            <th scope="col">{t("audit:diff.before")}</th>
            <th scope="col">{t("audit:diff.after")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className={row.same ? "same" : "changed"}>
              <th scope="row">{row.field}</th>
              <td>{value(row.before)}</td>
              <td>
                {value(row.after)}
                {row.same && ` (${t("audit:diff.same")})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
