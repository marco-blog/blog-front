import { data, Outlet, useLoaderData, type ShouldRevalidateFunctionArgs } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog } from "~/api/models";
import { isValidHandle } from "~/blog/ids";
import { BlogNav } from "~/components/blog/BlogNav";

import type { Route } from "./+types/layout";

/**
 * 공개 블로그 레이아웃(004 research B11, contracts/routes.md): `/:handle` 아래 공개 화면(홈·카테고리·태그·공지·보관함·검색·
 * 방명록·글 상세)을 감싸 블로그 메뉴를 그린다. 주소는 바뀌지 않는다. 글쓰기·관리 화면은 밖이다.
 * 자식 화면도 `GET /blogs/{handle}`을 부르지만 요청 메모로 한 번만 나간다(api/client.server.ts).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const blog = await createApiClient(request)
    .get<Blog>(`/blogs/${handle}`)
    .catch(throwApiErrorResponse);
  return {
    blog: {
      handle: blog.handle,
      title: blog.title,
      guestbookEnabled: blog.guestbookEnabled ?? true,
    },
  };
}

/**
 * 같은 블로그 안에서 옮겨 다닐 때는 다시 읽지 않는다. 블로그가 바뀌거나 이 레이아웃 아래 action(방명록·댓글 쓰기 등)이
 * 끝났을 때만 다시 읽는다.
 */
export function shouldRevalidate({
  currentParams,
  nextParams,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (currentParams.handle !== nextParams.handle) {
    return true;
  }
  if (formMethod && formMethod.toUpperCase() !== "GET") {
    return defaultShouldRevalidate;
  }
  return false;
}

export default function BlogLayout() {
  const { blog } = useLoaderData<typeof loader>();
  return (
    <div className="blog-layout">
      <BlogNav handle={blog.handle} title={blog.title} guestbookEnabled={blog.guestbookEnabled} />
      <div className="blog-layout-body">
        <div className="blog-layout-main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
