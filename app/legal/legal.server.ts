import { createApiClient } from "~/api/client.server";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import type { LegalDocument } from "~/api/models";
import { getSessionUser } from "~/auth/session.server";
import { resolveLanguage } from "~/i18n/language";

export type LegalDocumentType = "terms" | "privacy";

/**
 * 약관·개인정보처리방침 본문(FR-137, FR-155)을 화면 언어판으로 받는다. 화면 언어는 root loader와 같은 규칙
 * (회원 설정 → 쿠키 → Accept-Language → 영어)이며, backend는 그 언어판이 없으면 영어, 그다음 한국어판을 준다.
 */
export async function loadLegalDocument(
  request: Request,
  type: LegalDocumentType,
): Promise<{ document: LegalDocument }> {
  const member = await getSessionUser(request).catch((error: unknown) => {
    if (isApiError(error)) {
      return null;
    }
    throw error;
  });
  const document = await createApiClient(request)
    .get<LegalDocument>(`/legal/${type}`, {
      query: { lang: resolveLanguage(request, member?.locale) },
    })
    .catch(throwApiErrorResponse);
  return { document };
}
