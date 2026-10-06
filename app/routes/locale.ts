import { redirect } from "react-router";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  addResponseCookie,
  hasCookie,
} from "~/api/backendCookies.server";
import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";
import { safeNextPath } from "~/auth/paths";
import { isSupportedLanguage } from "~/i18n/config";
import { languageCookie } from "~/i18n/languageCookie.server";

import type { Route } from "./+types/locale";

/** 언어 선택 폼의 필드 이름 */
export const LANGUAGE_FIELD = "lang";
export const REDIRECT_FIELD = "redirectTo";

/** 돌아갈 주소: 폼의 `redirectTo`, 없으면 Referer. 같은 사이트 경로만 받는다(열린 리다이렉트 방지). */
function backTo(request: Request, form: FormData): string {
  const field = form.get(REDIRECT_FIELD);
  if (typeof field === "string" && field) {
    return safeNextPath(field);
  }
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.origin === new URL(request.url).origin) {
        return safeNextPath(`${url.pathname}${url.search}`);
      }
    } catch {
      // 잘못된 Referer는 무시한다.
    }
  }
  return "/";
}

/**
 * 하단 언어 선택(FR-150, research.md R22). JS 없이 폼 전송으로도 동작한다.
 * 고른 언어를 쿠키 `lang`(1년)에 저장하고, 로그인 상태면 회원 설정(`PATCH /me` `locale`)에도 저장해
 * 다른 기기에서도 그 언어로 보이게 한다(US5 AS3). 주소는 언어와 관계없이 같으므로 원래 페이지로 돌아간다.
 * 지원하지 않는 값이면 아무것도 바꾸지 않는다. 회원 설정 저장이 실패해도 이 브라우저의 언어는 바꾼다.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const target = backTo(request, form);
  const language = form.get(LANGUAGE_FIELD);
  if (!isSupportedLanguage(language)) {
    return redirect(target);
  }
  addResponseCookie(request, languageCookie(language));
  const cookie = request.headers.get("cookie");
  if (hasCookie(cookie, ACCESS_TOKEN_COOKIE) || hasCookie(cookie, REFRESH_TOKEN_COOKIE)) {
    try {
      await createApiClient(request).patch("/me", { body: { locale: language } });
    } catch (error) {
      if (!isApiError(error)) {
        throw error;
      }
    }
  }
  return redirect(target);
}

/** 주소창으로 연 GET /locale은 첫 화면으로 */
export function loader() {
  return redirect("/");
}
