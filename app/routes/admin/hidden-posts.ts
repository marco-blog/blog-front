import { redirect } from "react-router";

import { requireAdmin } from "~/admin/access.server";
import { contentPath } from "~/admin/contentSearch";

import type { Route } from "./+types/hidden-posts";

/** 005 숨긴 글 화면의 옛 주소. 콘텐츠 관리 글 탭의 숨김 목록으로 흡수했다(006 T039, 결정 표 10번). */
export const HIDDEN_POSTS_PATH = `${contentPath("posts")}?status=HIDDEN`;

/** `/admin/contents/hidden-posts` → `/admin/contents/posts?status=HIDDEN`. 관리자가 아니면 레이아웃과 같은 404 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return redirect(HIDDEN_POSTS_PATH);
}
