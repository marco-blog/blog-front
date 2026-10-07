import { useTranslation } from "react-i18next";
import { data, Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, PostSummary } from "~/api/models";
import { archiveHref, formatYearMonth, parseYearMonth } from "~/blog/archive";
import { isValidHandle } from "~/blog/ids";
import { parsePage, POST_PAGE_SIZE } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { PostList } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { metaLanguage, metaT } from "~/i18n/meta";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-archive";

/**
 * 월별 보관함의 그 달 글(`/:handle/archive/:year/:month?page=`, SSR, 004 FR-061). 연·월은 서비스 기준 시간대
 * (`blog.stats.time-zone`)의 달이다. 숫자가 아니거나 범위 밖이면 404.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  const yearMonth = parseYearMonth(params.year, params.month);
  if (!isValidHandle(handle) || yearMonth === null) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, posts] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<PostSummary[]>(`/blogs/${handle}/posts`, {
      query: { year: yearMonth.year, month: yearMonth.month, page: page - 1 },
    }),
  ]).catch(throwApiErrorResponse);
  return {
    blog: { handle: blog.handle, title: blog.title, description: blog.description },
    yearMonth,
    posts: posts.result,
    totalCount: posts.totalCount ?? posts.result.length,
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
  const language = metaLanguage(matches);
  const { blog, yearMonth, page, origin } = loaderData;
  return pageMeta({
    title: `${formatYearMonth(yearMonth, language)} - ${blog.title}`,
    description: blog.description,
    url: absoluteUrl(origin, archiveHref(blog.handle, yearMonth, page)),
    siteName: t("appName"),
  });
}

export default function BlogArchive() {
  const { t, i18n } = useTranslation();
  const { blog, yearMonth, posts, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  return (
    <main className="blog-archive">
      <header>
        <p>
          <Link to={`/${blog.handle}`}>{blog.title}</Link>
        </p>
        <h1>{formatYearMonth(yearMonth, i18n.language)}</h1>
      </header>
      <PostList handle={blog.handle} posts={posts} emptyText={t("blog:archive.empty")} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => archiveHref(blog.handle, yearMonth, target)}
      />
    </main>
  );
}
