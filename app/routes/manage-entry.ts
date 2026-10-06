import { redirect } from "react-router";

import { chooseBlog, readLastBlog } from "~/auth/lastBlog.server";
import { requireUser } from "~/auth/session.server";

import { BLOG_PICKER_PATH } from "./write-entry";

import type { Route } from "./+types/manage-entry";

/**
 * 상단 "내 블로그 관리" 진입점(`/manage`, 화면 없음, contracts/routes.md). 비로그인은 `/login?next=/manage`.
 * 블로그가 1개면 그 블로그, 여러 개면 최근에 쓴 블로그(쿠키 `last_blog`)의 `/:handle/manage`로, 알 수 없으면 블로그 선택 화면으로.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const handle = chooseBlog(
    user.blogs.map((blog) => blog.handle),
    readLastBlog(request),
  );
  throw redirect(handle ? `/${handle}/manage` : BLOG_PICKER_PATH);
}
