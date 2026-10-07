import {
  data,
  Outlet,
  useLoaderData,
  useParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, SidebarView } from "~/api/models";
import { isValidHandle, parsePostId } from "~/blog/ids";
import { BlogNav } from "~/components/blog/BlogNav";
import { Sidebar } from "~/components/blog/Sidebar";

import type { Route } from "./+types/layout";
import styles from "./layout.css?url";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: styles }];

/**
 * 공개 블로그 레이아웃(004 research B11, contracts/routes.md): `/:handle` 아래 공개 화면(홈·카테고리·태그·공지·보관함·검색·
 * 방명록·글 상세)을 감싸 블로그 메뉴와 사이드바를 그린다. 주소는 바뀌지 않는다. 글쓰기·관리 화면은 밖이다.
 * - `GET /blogs/{handle}`, `GET /blogs/{handle}/sidebar`, `POST /blogs/{handle}/visits`(방문 기록, 실패해도 무시)를 함께 부른다.
 * - 자식 화면도 `GET /blogs/{handle}`을 부르지만 요청 메모로 한 번만 나간다(api/client.server.ts).
 * - 사이드바를 읽지 못하면 블로그 정보로 그릴 수 있는 항목만 보여준다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const api = createApiClient(request);
  const [blog, sidebar] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`).catch(throwApiErrorResponse),
    api.get<SidebarView>(`/blogs/${handle}/sidebar`).catch(() => null),
    api.post(`/blogs/${handle}/visits`).catch(() => null),
  ]);
  return {
    blog: {
      handle: blog.handle,
      title: blog.title,
      description: blog.description,
      owner: blog.owner,
      categories: blog.categories,
      guestbookEnabled: blog.guestbookEnabled ?? true,
    },
    sidebar,
  };
}

/**
 * 같은 블로그 안에서 옮겨 다닐 때는 다시 읽지 않는다(방문 기록도 다시 보내지 않음. backend가 하루 한 번만 세므로 보내도 결과는 같다).
 * 블로그가 바뀌거나 이 레이아웃 아래 action(방명록·댓글 쓰기 등)이 끝났을 때만 다시 읽는다.
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
  const { blog, sidebar } = useLoaderData<typeof loader>();
  const { categoryId } = useParams();
  return (
    <div className="blog-layout">
      <BlogNav handle={blog.handle} title={blog.title} guestbookEnabled={blog.guestbookEnabled} />
      <div className="blog-layout-body">
        <div className="blog-layout-main">
          <Outlet />
        </div>
        <Sidebar blog={blog} view={sidebar} currentCategoryId={parsePostId(categoryId)} />
      </div>
    </div>
  );
}
