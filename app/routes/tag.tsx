import { useTranslation } from "react-i18next";
import { data, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { TaggedPostSummary } from "~/api/models";
import { parsePage, parseTagName, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { PostList, tagHref } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/tag";

/**
 * 서비스 전체 태그별 글(`/tags/:name`, SSR). 여러 블로그의 "목록 노출 가능" 글을 최신순으로 보여주고,
 * 각 글은 그 글의 블로그 주소로 간다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const tag = parseTagName(params.name);
  if (tag === null) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const posts = await createApiClient(request)
    .send<TaggedPostSummary[]>(`/tags/${encodeURIComponent(tag)}/posts`, {
      query: { page: page - 1 },
    })
    .catch(throwApiErrorResponse);
  return {
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
  const { tag, page, origin } = loaderData;
  return pageMeta({
    title: `#${tag} - ${t("appName")}`,
    url: absoluteUrl(origin, withPage(tagHref(tag), page)),
    siteName: t("appName"),
  });
}

export default function TagPage() {
  const { t } = useTranslation();
  const { tag, posts, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  return (
    <main className="tag-posts">
      <h1>#{tag}</h1>
      <PostList posts={posts} tagScope="global" emptyText={t("tag:page.empty")} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => withPage(tagHref(tag), target)}
      />
    </main>
  );
}
