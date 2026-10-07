import { redirect } from "react-router";

import { chooseBlog, readLastBlog } from "~/auth/lastBlog.server";
import { requireUser } from "~/auth/session.server";

import { BLOG_PICKER_PATH } from "./write-entry";

import type { Route } from "./+types/manage-external-entry";

/**
 * 알림 링크용 외부 블로그 진입점(`/manage/external-blogs`, `/manage/external-blogs/:id`, 화면 없음, 007 contracts/routes.md).
 * `/manage`와 같은 규칙으로 고른 블로그의 `/:handle/manage/external-blogs(/:id)`로 보낸다. id가 숫자가 아니면 목록으로.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const handle = chooseBlog(
    user.blogs.map((blog) => blog.handle),
    readLastBlog(request),
  );
  if (!handle) {
    throw redirect(BLOG_PICKER_PATH);
  }
  const id = params.id && /^\d{1,18}$/.test(params.id) ? `/${params.id}` : "";
  throw redirect(`/${handle}/manage/external-blogs${id}`);
}
