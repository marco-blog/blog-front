import type { Verification } from "~/api/models";

/**
 * 확인에 실패했을 때 화면에 코드를 다시 보이려고, 확인 폼이 함께 보낸 숨은 값(`verificationId`·`code`·`expiresAt`·`feedUrl`)으로
 * 발급 정보를 되살린다(코드를 다시 읽는 API는 없다). 값이 모자라면 null.
 */
export function verificationFromForm(form: FormData): Verification | null {
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const id = Number(text("verificationId"));
  const code = text("code");
  const expiresAt = text("expiresAt");
  if (!Number.isSafeInteger(id) || id <= 0 || !code || !expiresAt) {
    return null;
  }
  return {
    id,
    feedUrl: text("feedUrl"),
    code,
    expiresAt,
    verifiedAt: null,
    claimableExternalBlogId: null,
  };
}
