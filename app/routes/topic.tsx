import { useTranslation } from "react-i18next";
import { data, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import type { PortalCard, TopicNode } from "~/api/models";
import { parsePage, POST_PAGE_SIZE } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { PortalCardList } from "~/components/portal/PortalCard";
import { SortToggle, type TopicSort } from "~/components/portal/SortToggle";
import { SourceFilter } from "~/components/portal/SourceFilter";
import { TopicSubTabs } from "~/components/portal/TopicSubTabs";
import { publicOrigin } from "~/config.server";
import { parseSource, type PortalSource, sourceHref, sourceQuery } from "~/external/sourceFilter";
import { DEFAULT_LANGUAGE, isSupportedLanguage } from "~/i18n/config";
import { metaT } from "~/i18n/meta";
import { resolveTopicPath, topicHref, topicName } from "~/portal/topics";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/topic";

/** 주소의 `?sort=`. `popular`만 인기순, 그 밖은 최신순(기본) */
export function parseSort(value: string | null): TopicSort {
  return value === "popular" ? "popular" : "latest";
}

/** 정렬·페이지·출처(007)를 붙인 주제 페이지 주소(최신순·첫 페이지·전체 출처는 붙이지 않음) */
export function topicPageHref(
  path: string,
  sort: TopicSort,
  page: number,
  source: PortalSource = "all",
): string {
  const params = new URLSearchParams();
  if (sort === "popular") {
    params.set("sort", sort);
  }
  if (source !== "all") {
    params.set("source", source);
  }
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * 주제 페이지(`/topics/:major`, `/topics/:major/:minor`, SSR, 003 FR-078, contracts/routes.md).
 * `GET /topics` 트리로 주소를 확인한다: 없는 slug, 대분류 자리의 소분류, 부모가 다른 소분류는 404.
 * 글은 `GET /topics/{slug}/posts?sort=&source=&page=(0부터)&size=20`. backend가 `TOPIC_NOT_FOUND`(운영자 숨김)면 404.
 * `?source=internal|external`(007)은 정렬 옆 출처 필터이고, 그 주소는 noindex·canonical 제외다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const sort = parseSort(url.searchParams.get("sort"));
  const page = parsePage(url.searchParams.get("page"));
  const source = parseSource(url.searchParams.get("source"));
  const api = createApiClient(request);
  const tree = await api.get<TopicNode[]>("/topics").catch(throwApiErrorResponse);
  const found = resolveTopicPath(tree, params.major, params.minor);
  if (!found) {
    throw data(null, { status: 404 });
  }
  const response = await api
    .send<PortalCard[]>(`/topics/${encodeURIComponent(found.topic.slug)}/posts`, {
      query: { sort, source: sourceQuery(source), page: page - 1, size: POST_PAGE_SIZE },
    })
    .catch((error: unknown) => {
      if (isApiError(error) && error.resultCode === "TOPIC_NOT_FOUND") {
        throw data(null, { status: 404 });
      }
      return throwApiErrorResponse(error);
    });
  const major = found.parent ?? found.topic;
  return {
    major,
    current: found.parent ? found.topic : null,
    path: topicHref(found),
    names: found.topic.names,
    sort,
    source,
    page,
    pageSize: POST_PAGE_SIZE,
    posts: response.result,
    totalCount: response.totalCount ?? response.result.length,
    topics: tree,
    now: new Date().toISOString(),
    origin: publicOrigin(request),
  };
}

function languageOf(matches: Route.MetaArgs["matches"]): string {
  const root = matches.find((match) => match?.id === "root")?.loaderData as
    { language?: string } | undefined;
  return root?.language && isSupportedLanguage(root.language) ? root.language : DEFAULT_LANGUAGE;
}

/** `{주제} - 서비스명`, 설명, og, canonical(정렬·출처 제외, 2쪽부터 `?page=`). 인기순·출처 필터는 noindex. */
export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const name = topicName(loaderData.names, languageOf(matches));
  return pageMeta({
    title: `${name} - ${t("appName")}`,
    description: t("portal:topic.description", { name }),
    url: absoluteUrl(loaderData.origin, topicPageHref(loaderData.path, "latest", loaderData.page)),
    type: "website",
    siteName: t("appName"),
    noindex: loaderData.sort === "popular" || (loaderData.source ?? "all") !== "all",
  });
}

export default function TopicPage() {
  const { t, i18n } = useTranslation();
  const {
    major,
    current,
    path,
    names,
    sort,
    source,
    page,
    pageSize,
    posts,
    totalCount,
    topics,
    now,
  } = useLoaderData<typeof loader>();
  const name = topicName(names, i18n.language);
  return (
    <main className="topic-page">
      <h1>{name}</h1>
      <TopicSubTabs major={major} current={current} />
      <SortToggle path={path} sort={sort} source={source} />
      <SourceFilter
        current={source}
        hrefFor={(value) =>
          sourceHref(path, value, { sort: sort === "popular" ? sort : undefined })
        }
      />
      {posts.length === 0 ? (
        <p className="portal-empty">
          {sort === "popular"
            ? t("portal:topic.popularEmpty")
            : source !== "all"
              ? t("portal:topic.sourceEmpty")
              : t("portal:topic.empty")}
        </p>
      ) : (
        <PortalCardList cards={posts} topics={topics} now={now} label={t("portal:topic.posts")} />
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => topicPageHref(path, sort, target, source)}
      />
    </main>
  );
}
