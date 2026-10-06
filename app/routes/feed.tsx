import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { FeedPost } from "~/api/models";
import { requireUser } from "~/auth/session.server";
import { parsePage, POST_PAGE_SIZE } from "~/blog/listing";
import { FeedPostList } from "~/components/post/FeedPostList";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/feed";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("discovery:feed.title"), t("appName"));
}

/**
 * 구독 피드(`/feed`, SSR, 002 FR-032). 구독한 블로그들의 "목록 노출 가능" 글을 발행 최신순으로 20개씩.
 * 로그인 회원만 보며(비로그인은 로그인 화면으로), 사람마다 다른 화면이라 검색에 넣지 않는다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const { result, totalCount } = await createApiClient(request)
    .send<FeedPost[]>("/me/feed", { query: { page: page - 1, size: POST_PAGE_SIZE } })
    .catch(throwApiErrorResponse);
  return { posts: result, totalCount: totalCount ?? result.length, page, pageSize: POST_PAGE_SIZE };
}

export default function FeedPage() {
  const { t } = useTranslation();
  const { posts, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  return (
    <main className="feed">
      <h1>{t("discovery:feed.title")}</h1>
      <p>{t("discovery:feed.label")}</p>
      <FeedPostList posts={posts} page={page} totalCount={totalCount} pageSize={pageSize} />
    </main>
  );
}
