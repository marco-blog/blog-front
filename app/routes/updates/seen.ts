import { data, redirect } from "react-router";

import { createApiClient } from "~/api/client.server";
import { getSessionUser, safeNextPath } from "~/auth/session.server";
import { parseVersionParam } from "~/updates/versionTree";

import type { Route } from "./+types/seen";

/**
 * 릴리스 노트 배너 닫기(`POST /updates/seen`, 화면 없음, 003 FR-163): 로그인 회원이면 `POST /me/release-notes/seen { version }`
 * 뒤 `next`(같은 사이트 경로만, 아니면 `/`)로 보낸다. JS가 있는 배너(fetcher, `js=1`)에는 이동 없이 결과만 돌려준다.
 * 저장이 실패해도 배너는 닫는다(다음 화면에서 다시 보일 수 있다).
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const version = parseVersionParam(`v${String(form.get("version") ?? "")}`);
  const next = safeNextPath(String(form.get("next") ?? ""));
  const user = await getSessionUser(request).catch(() => null);
  if (user && version) {
    await createApiClient(request)
      .post("/me/release-notes/seen", { body: { version } })
      .catch(() => null);
  }
  if (form.get("js") === "1") {
    return data({ ok: true });
  }
  return redirect(next);
}

/** 주소로 열면 업데이트 소식으로 */
export function loader() {
  return redirect("/updates");
}
