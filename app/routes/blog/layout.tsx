import { useTranslation } from "react-i18next";
import {
  data,
  isRouteErrorResponse,
  Outlet,
  useLoaderData,
  useParams,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import type { Blog, SidebarView } from "~/api/models";
import { isValidHandle, parsePostId } from "~/blog/ids";
import { BlogNav } from "~/components/blog/BlogNav";
import { RestrictedBlog } from "~/components/blog/RestrictedBlog";
import { Sidebar } from "~/components/blog/Sidebar";
import { ErrorPage } from "~/components/ErrorPage";
import { NotFound } from "~/components/NotFound";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/layout";
import styles from "./layout.css?url";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: styles }];

/**
 * 공개 블로그 레이아웃(004 research B11, contracts/routes.md): `/:handle` 아래 공개 화면(홈·카테고리·태그·공지·보관함·검색·
 * 방명록·글 상세)을 감싸 블로그 메뉴와 사이드바를 그린다. 주소는 바뀌지 않는다. 글쓰기·관리 화면은 밖이다.
 * - `GET /blogs/{handle}`, `GET /blogs/{handle}/sidebar`, `POST /blogs/{handle}/visits`(방문 기록, 실패해도 무시)를 함께 부른다.
 * - 자식 화면도 `GET /blogs/{handle}`을 부르지만 요청 메모로 한 번만 나간다(api/client.server.ts).
 * - 사이드바를 읽지 못하면 블로그 정보로 그릴 수 있는 항목만 보여준다.
 * - 005: 주인이 정지된 블로그(404 `BLOG_RESTRICTED`)는 `{ restricted: true }` 404를 던져 이 레이아웃의 ErrorBoundary가
 *   "이용이 제한된 블로그"를 그린다(블로그 메뉴·사이드바 없음, 방문 기록은 블로그를 읽은 뒤에만 보내므로 남지 않음).
 *   자식 화면의 오류보다 이 레이아웃의 오류가 먼저 쓰인다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const api = createApiClient(request);
  const blogRequest = api.get<Blog>(`/blogs/${handle}`);
  const [blog, sidebar] = await Promise.all([
    blogRequest.catch(throwBlogError),
    api.get<SidebarView>(`/blogs/${handle}/sidebar`).catch(() => null),
    blogRequest.then(() => api.post(`/blogs/${handle}/visits`)).catch(() => null),
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

export const RESTRICTED_CODE = "BLOG_RESTRICTED";

/** 이용이 제한된 블로그면 `{ restricted: true }` 404, 그 밖의 API 오류는 같은 상태 코드로 */
function throwBlogError(error: unknown): never {
  if (isApiError(error) && error.resultCode === RESTRICTED_CODE) {
    throw data({ restricted: true, resultCode: RESTRICTED_CODE }, { status: 404 });
  }
  return throwApiErrorResponse(error);
}

/** 이 레이아웃(또는 자식)이 던진 오류가 "이용이 제한된 블로그"인지 */
export function isRestrictedError(error: unknown): boolean {
  return (
    isRouteErrorResponse(error) &&
    error.status === 404 &&
    ((error.data as { restricted?: boolean } | null)?.restricted === true ||
      (error.data as { resultCode?: string } | null)?.resultCode === RESTRICTED_CODE)
  );
}

/** 오류 화면의 제목(검색 제외). 정상 화면은 자식 화면의 meta를 쓴다 */
export function meta({ error, matches }: Route.MetaArgs) {
  if (!error) {
    return [];
  }
  const t = metaT(matches);
  if (isRestrictedError(error)) {
    return privatePageMeta(t("moderation:restricted.title"), t("appName"));
  }
  return privatePageMeta(
    t(isRouteErrorResponse(error) && error.status === 404 ? "notFound.title" : "error.title"),
    t("appName"),
  );
}

/**
 * 블로그 화면의 오류(root와 같은 화면). 이용이 제한된 블로그는 안내만 그린다.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  if (isRestrictedError(error)) {
    return <RestrictedBlog />;
  }
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return <NotFound />;
    }
    const code = (error.data as { resultCode?: string } | null)?.resultCode;
    return <ErrorPage message={code ? errorMessage(t, code) : undefined} />;
  }
  return <ErrorPage />;
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
