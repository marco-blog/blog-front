import { useTranslation } from "react-i18next";
import { Link, data, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, PostSummary } from "~/api/models";
import { isValidHandle } from "~/blog/ids";
import { parsePage, parseTagName, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { CategoryTree } from "~/components/blog/CategoryTree";
import { PostList, blogTagHref } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import { ogImageUrl } from "~/media/thumbnail";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-tag";

/**
 * 블로그 안 태그별 글(`/:handle/tags/:name`, SSR). 태그 이름은 backend와 같은 규칙으로 정규화한다
 * (`/marco/tags/Spring`과 `/marco/tags/spring`은 같은 목록).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  const tag = parseTagName(params.name);
  if (!isValidHandle(handle) || tag === null) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, posts] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<PostSummary[]>(`/blogs/${handle}/posts`, { query: { tag, page: page - 1 } }),
  ]).catch(throwApiErrorResponse);
  return {
    blog,
    tag,
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
  const { blog, tag, page, origin } = loaderData;
  return pageMeta({
    title: `#${tag} - ${blog.title}`,
    description: blog.description,
    image: absoluteUrl(origin, ogImageUrl(blog.coverImageUrl)),
    url: absoluteUrl(origin, withPage(blogTagHref(blog.handle, tag), page)),
    siteName: t("appName"),
  });
}

export default function BlogTag() {
  const { t } = useTranslation();
  const { blog, tag, posts, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  return (
    <main className="blog-tag">
      <header>
        <p>
          <Link to={`/${blog.handle}`}>{blog.title}</Link>
        </p>
        <h1>#{tag}</h1>
      </header>
      <CategoryTree handle={blog.handle} categories={blog.categories} />
      <PostList handle={blog.handle} posts={posts} emptyText={t("tag:page.empty")} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => withPage(blogTagHref(blog.handle, tag), target)}
      />
    </main>
  );
}
