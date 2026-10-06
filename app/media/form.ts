/**
 * `ImageUploadField`가 보낸 값을 PATCH 본문 값으로: 보내지 않았으면 undefined(그대로 둠),
 * 빈 문자열이면 null(지움), 아니면 키.
 */
export function imageFieldValue(form: FormData, name: string): string | null | undefined {
  if (!form.has(name)) {
    return undefined;
  }
  const value = String(form.get(name) ?? "").trim();
  return value === "" ? null : value;
}
