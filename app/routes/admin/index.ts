import { redirect } from "react-router";

import { requireAdmin } from "~/admin/access.server";
import { ADMIN_HOME } from "~/admin/links";

import type { Route } from "./+types/index";

/** `/admin`: 화면 없이 첫 메뉴(`/admin/topics`)로. 관리자가 아니면 레이아웃과 같은 404 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return redirect(ADMIN_HOME);
}
