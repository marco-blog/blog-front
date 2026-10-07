import { useTranslation } from "react-i18next";
import { data, Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, PostSummary } from "~/api/models";
import { isValidHandle } from "~/blog/ids";
import { parsePage, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { PostList } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-notice";

export function noticeHref(handle: string, page = 1): string {
  return withPage(`/${handle}/notice`, page);
}

/** 공지 목록(`/:handle/notice?page=`, SSR, 004 FR-059): 목록 노출 가능한 공지 글, 발행 최신순 20개 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, notices] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<PostSummary[]>(`/blogs/${handle}/notices`, {
      query: { page: page - 1, size: POST_PAGE_SIZE },
    }),
  ]).catch(throwApiErrorResponse);
  return {
    blog: { handle: blog.handle, title: blog.title, description: blog.description },
    posts: notices.result,
    totalCount: notices.totalCount ?? notices.result.length,
    page,
    pageSize: POST_PAGE_SIZE,
    origin: publicOrigin(request),
  };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const { blog, page, origin } = loaderData;
  return pageMeta({
    title: `${t("blog:notice.title")} - ${blog.title}`,
    description: blog.description,
    url: absoluteUrl(origin, noticeHref(blog.handle, page)),
    siteName: t("appName"),
  });
}

export default function BlogNotice() {
  const { t } = useTranslation();
  const { blog, posts, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  return (
    <main className="blog-notice">
      <header>
        <p>
          <Link to={`/${blog.handle}`}>{blog.title}</Link>
        </p>
        <h1>{t("blog:notice.title")}</h1>
      </header>
      <PostList handle={blog.handle} posts={posts} emptyText={t("blog:notice.empty")} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => noticeHref(blog.handle, target)}
      />
    </main>
  );
}
