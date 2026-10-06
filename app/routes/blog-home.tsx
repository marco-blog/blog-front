import { useTranslation } from "react-i18next";
import { data, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, PostSummary } from "~/api/models";
import { isValidHandle } from "~/blog/ids";
import { parsePage, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { CategoryTree } from "~/components/blog/CategoryTree";
import { Avatar } from "~/components/media/Avatar";
import { PostList } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import { ogImageUrl, thumbnailImage } from "~/media/thumbnail";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-home";

/** 한 페이지 글 수(FR-011) */
export const PAGE_SIZE = POST_PAGE_SIZE;

function pageHref(handle: string, page: number): string {
  return withPage(`/${handle}`, page);
}

/**
 * 블로그 홈(`/:handle`, SSR). 블로그 정보와 공개 글 목록(최신순 20개, backend 페이지는 0부터)을 서버에서 불러온다.
 * 없는 블로그·삭제된 블로그·정지된 회원의 블로그는 HTTP 404(FR-159).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, posts] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<PostSummary[]>(`/blogs/${handle}/posts`, { query: { page: page - 1 } }),
  ]).catch(throwApiErrorResponse);
  return {
    blog,
    posts: posts.result,
    totalCount: posts.totalCount ?? posts.result.length,
    page,
    pageSize: PAGE_SIZE,
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
    title: blog.title,
    description: blog.description,
    image: absoluteUrl(origin, ogImageUrl(blog.coverImageUrl)),
    url: absoluteUrl(origin, pageHref(blog.handle, page)),
    siteName: t("appName"),
  });
}

export default function BlogHome() {
  const { t } = useTranslation();
  const { blog, posts, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  return (
    <main className="blog-home">
      <header>
        {blog.coverImageUrl && (
          <img {...thumbnailImage(blog.coverImageUrl, "cover")} alt="" className="blog-cover" />
        )}
        <h1>{blog.title}</h1>
        {blog.description && <p>{blog.description}</p>}
        <p>
          <Avatar url={blog.owner.profileImageUrl} size="avatar" />{" "}
          {t("post:blog.owner", { nickname: blog.owner.nickname })}
        </p>
      </header>
      <CategoryTree handle={blog.handle} categories={blog.categories} />
      <PostList handle={blog.handle} posts={posts} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => pageHref(blog.handle, target)}
      />
    </main>
  );
}
