import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useRouteLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type {
  PortalCard,
  PortalHome,
  ReleaseNoteList,
  ReleaseNoteSummary,
  TopicNode,
} from "~/api/models";
import { CurationSection } from "~/components/portal/CurationSection";
import { EmptyPortal } from "~/components/portal/EmptyPortal";
import { LatestPosts, type LatestBatch } from "~/components/portal/LatestPosts";
import { NewBlogs } from "~/components/portal/NewBlogs";
import { PopularPosts } from "~/components/portal/PopularPosts";
import { PopularTags } from "~/components/portal/PopularTags";
import { TopicTabs } from "~/components/portal/TopicTabs";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import type { RootData } from "~/root";
import { absoluteUrl, pageMeta } from "~/seo/meta";

import type { Route } from "./+types/home";

/**
 * 포털 메인(`/`, SSR, 003 FR-034·080·085~087, contracts/routes.md). `/portal`·`/topics`·`/release-notes`를 함께 부른다.
 * `/topics`·`/release-notes`가 실패하면 그 영역(주제 탭·릴리스 노트 카드)만 숨기고, `/portal`이 실패하면 오류 화면.
 * `?cursor=`가 있으면 `/portal/latest?cursor=`로 그 최신 글 묶음도 읽는다(JS 없는 "더 보기"와 `useFetcher`가 같은 loader).
 * 잘못된 커서는 무시하고 첫 묶음을 보여준다. `now`는 상대 시각 기준인 서버 시각이다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const cursor = new URL(request.url).searchParams.get("cursor")?.trim() || null;
  const api = createApiClient(request);
  const [portal, topics, releaseNotes, cursorBatch] = await Promise.all([
    api.get<PortalHome>("/portal").catch(throwApiErrorResponse),
    api.get<TopicNode[]>("/topics").catch(() => null),
    api.get<ReleaseNoteList>("/release-notes").catch(() => null),
    cursor
      ? api
          .send<PortalCard[]>("/portal/latest", { query: { cursor } })
          .then((response): LatestBatch => ({
            cursor,
            items: response.result,
            nextCursor: response.nextCursor ?? null,
          }))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    portal,
    topics: topics ?? [],
    releaseCard: releaseNotes?.portalCard ?? null,
    cursor,
    cursorBatch,
    now: new Date().toISOString(),
    origin: publicOrigin(request),
  };
}

/** 서비스명, 설명, og, canonical `/`. 커서 묶음 주소는 noindex(contracts/routes.md). */
export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  const origin = loaderData?.origin ?? null;
  return pageMeta({
    title: t("appName"),
    description: t("portal:meta.description"),
    url: origin ? absoluteUrl(origin, "/") : null,
    type: "website",
    siteName: t("appName"),
    noindex: Boolean(loaderData?.cursor),
  });
}

function isEmpty(portal: PortalHome): boolean {
  return (
    portal.curations.length === 0 &&
    portal.popular.length === 0 &&
    portal.latest.items.length === 0 &&
    portal.popularTags.length === 0 &&
    portal.newBlogs.length === 0
  );
}

function ReleaseNoteCard({ note }: { note: ReleaseNoteSummary }) {
  const { t } = useTranslation();
  return (
    <aside className="portal-release-note">
      <p>
        {t("portal:home.releaseNote", { title: note.title })}{" "}
        <Link to={`/updates/v${note.version}`}>{t("portal:home.releaseNoteLink")}</Link>
      </p>
    </aside>
  );
}

/** 영역 순서: 릴리스 노트 카드 → 추천 → 주제 탭 → 인기 → 최신 → 인기 태그 → 새 블로그. 빈 영역은 숨긴다. */
export default function Home() {
  const { t } = useTranslation();
  const { portal, topics, releaseCard, cursorBatch, now } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData<RootData>("root");
  const loggedIn = Boolean(rootData?.user);
  const latest: LatestBatch = cursorBatch ?? {
    cursor: null,
    items: portal.latest.items,
    nextCursor: portal.latest.nextCursor ?? null,
  };
  return (
    <main className="portal">
      <h1>{t("portal:home.title")}</h1>
      {loggedIn && (
        <p className="portal-feed-link">
          <Link to="/feed">{t("portal:home.feedLink")}</Link>
        </p>
      )}
      {releaseCard && <ReleaseNoteCard note={releaseCard} />}
      {isEmpty(portal) && !cursorBatch ? (
        <EmptyPortal loggedIn={loggedIn} />
      ) : (
        <>
          <CurationSection cards={portal.curations} topics={topics} now={now} />
          <TopicTabs topics={topics} />
          <PopularPosts cards={portal.popular} topics={topics} now={now} />
          <LatestPosts key={latest.cursor ?? ""} initial={latest} topics={topics} now={now} />
          <PopularTags tags={portal.popularTags} />
          <NewBlogs blogs={portal.newBlogs} now={now} />
        </>
      )}
    </main>
  );
}
