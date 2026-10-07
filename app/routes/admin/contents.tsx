import { redirect } from "react-router";

import { requireAdmin } from "~/admin/access.server";
import { contentPath } from "~/admin/contentSearch";

import type { Route } from "./+types/contents";

/** `/admin/contents`: 화면 없이 글 탭(`/admin/contents/posts`)으로(006 T037). 관리자가 아니면 레이아웃과 같은 404 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return redirect(contentPath("posts"));
}
