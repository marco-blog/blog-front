import { formId, formText, invalidField } from "./actions.server";

/** 양의 정수 문자열이면 그 값, 아니면 null */
function positiveId(value: string | null): number | null {
  if (!value || !/^\d{1,18}$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 선택한 줄의 `{id, topicId}`(같은 id는 한 번). 주제가 비면 입력 오류 */
export function batchItems(form: FormData): { id: number; topicId: number }[] {
  const ids = [
    ...new Set(
      form
        .getAll("selected")
        .map((value) => positiveId(typeof value === "string" ? value : null))
        .filter((id): id is number => id !== null),
    ),
  ];
  return ids.map((id) => {
    const topicId = formId(form, `topic-${id}`);
    if (topicId === null) {
      throw invalidField("topicId", "REQUIRED");
    }
    return { id, topicId };
  });
}

/** 정수 폼 값(음수 허용). 비면 기본값, 정수가 아니면 null */
export function formInteger(form: FormData, name: string, fallback: number): number | null {
  const text = formText(form, name);
  if (!text) {
    return fallback;
  }
  return /^-?\d{1,6}$/.test(text) ? Number(text) : null;
}
