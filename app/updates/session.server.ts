import { isApiError } from "~/api/errors";
import { getSessionUser, type SessionUser } from "~/auth/session.server";
import type { Language } from "~/i18n/config";
import { resolveLanguage } from "~/i18n/resolveLanguage.server";

/**
 * 릴리스 노트 화면의 언어판(화면 언어, 003 FR-160)과 로그인 회원. backend에 닿지 못해도 비로그인으로 본다.
 * /me는 root loader와 같은 요청에서 한 번만 부른다(getSessionUser 메모).
 */
export async function noteReader(
  request: Request,
): Promise<{ language: Language; user: SessionUser | null }> {
  const user = await getSessionUser(request).catch((error: unknown) => {
    if (isApiError(error)) {
      return null;
    }
    throw error;
  });
  return { language: resolveLanguage(request, user?.locale), user };
}
