import { redirect } from "react-router";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  addResponseCookie,
} from "~/api/backendCookies.server";
import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";

import type { Route } from "./+types/logout";

/** 쿠키 삭제(backend와 같은 이름·경로·속성). 운영(HTTPS)에서는 Secure도 붙인다. */
function clearCookie(name: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
}

/**
 * 로그아웃(상단 메뉴의 폼, JS 없이도 동작). backend가 리프레시 family를 폐기하고 쿠키를 지운다(FR-006).
 * backend에 닿지 못해도 이 브라우저의 쿠키는 지우고 첫 화면으로 보낸다.
 */
export async function action({ request }: Route.ActionArgs) {
  try {
    await createApiClient(request).post("/auth/logout");
  } catch (error) {
    if (!isApiError(error)) {
      throw error;
    }
    addResponseCookie(request, clearCookie(ACCESS_TOKEN_COOKIE));
    addResponseCookie(request, clearCookie(REFRESH_TOKEN_COOKIE));
  }
  return redirect("/");
}

/** 주소창으로 연 GET /logout은 아무것도 하지 않고 첫 화면으로 */
export function loader() {
  return redirect("/");
}
