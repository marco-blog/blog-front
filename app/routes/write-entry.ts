import { redirect } from "react-router";

import { chooseBlog, readLastBlog } from "~/auth/lastBlog.server";
import { requireUser } from "~/auth/session.server";

import type { Route } from "./+types/write-entry";

/** 블로그를 정하지 못했을 때 가는 블로그 선택 화면 */
export const BLOG_PICKER_PATH = "/settings/blogs";

/**
 * 상단 "글쓰기" 진입점(`/write`, 화면 없음, contracts/routes.md). 비로그인은 `/login?next=/write`.
 * 내 블로그 목록은 /me 응답의 `blogs`(삭제하지 않은 블로그)를 쓴다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const handle = chooseBlog(
    user.blogs.map((blog) => blog.handle),
    readLastBlog(request),
  );
  throw redirect(handle ? `/${handle}/write` : BLOG_PICKER_PATH);
}
