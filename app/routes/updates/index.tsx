import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import type { ReleaseNoteDetail, ReleaseNoteList, ReleaseNoteSearchHit } from "~/api/models";
import { parsePage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { publicOrigin } from "~/config.server";
import { formatDate } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { pageMeta, privatePageMeta } from "~/seo/meta";
import { noteReader } from "~/updates/session.server";
import {
  compareVersionsDesc,
  plainTextExcerpt,
  searchQueryError,
  versionHref,
} from "~/updates/versionTree";

import type { Route } from "./+types/index";
import { ReleaseNoteArticle } from "./version";

export const SEARCH_PAGE_SIZE = 20;

type IndexData =
  | { mode: "latest"; note: ReleaseNoteDetail; origin: string }
  | { mode: "empty"; origin: string }
  | {
      mode: "search";
      q: string;
      page: number;
      hits: ReleaseNoteSearchHit[];
      totalCount: number;
      /** 검색어 검사·backend 오류 코드(있으면 결과 대신 안내) */
      errorCode: string | null;
      origin: string;
    };

/**
 * `/updates`(003 T124): 최신 버전 본문·목차, 게시된 노트가 없으면 안내.
 * `?q=`가 있으면 오른쪽에 검색 결과(버전·제목·일치 부분, 새 버전부터). 검색어가 2자 미만·100자 초과면 backend를 부르지 않는다.
 */
export async function loader({ request }: Route.LoaderArgs): Promise<IndexData> {
  const { language } = await noteReader(request);
  const api = createApiClient(request);
  const origin = publicOrigin(request);
  const search = new URL(request.url).searchParams;

  if (search.has("q")) {
    const q = (search.get("q") ?? "").trim();
    const page = parsePage(search.get("page"));
    const base = { mode: "search" as const, q, page, hits: [], totalCount: 0, origin };
    if (searchQueryError(q)) {
      return { ...base, errorCode: "VALIDATION_FAILED" };
    }
    try {
      const result = await api.send<ReleaseNoteSearchHit[]>("/release-notes/search", {
        query: { q, lang: language, page: page - 1, size: SEARCH_PAGE_SIZE },
      });
      return {
        ...base,
        hits: result.result,
        totalCount: result.totalCount ?? result.result.length,
        errorCode: null,
      };
    } catch (error) {
      if (isApiError(error) && error.status === 400) {
        return { ...base, errorCode: error.resultCode };
      }
      return throwApiErrorResponse(error);
    }
  }

  const list = await api
    .get<ReleaseNoteList>("/release-notes", { query: { lang: language } })
    .catch(throwApiErrorResponse);
  const latest = [...list.items].sort((a, b) => compareVersionsDesc(a.version, b.version))[0];
  if (!latest) {
    return { mode: "empty", origin };
  }
  const note = await api
    .get<ReleaseNoteDetail>(`/release-notes/${latest.version}`, { query: { lang: language } })
    .catch(throwApiErrorResponse);
  return { mode: "latest", note, origin };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  const title = `${t("updates:title")} - ${t("appName")}`;
  if (!loaderData || loaderData.mode === "search") {
    return privatePageMeta(t("updates:title"), t("appName"));
  }
  if (loaderData.mode === "empty") {
    return pageMeta({
      title,
      description: t("updates:description"),
      url: `${loaderData.origin}/updates`,
      siteName: t("appName"),
    });
  }
  const { note, origin } = loaderData;
  return pageMeta({
    title: `${note.title} - ${t("appName")}`,
    description: plainTextExcerpt(note.contentHtml),
    // 최신 버전 주소가 대표 주소다(contracts/routes.md).
    url: `${origin}${versionHref(note.version)}`,
    siteName: t("appName"),
  });
}

export default function UpdatesIndex() {
  const { t } = useTranslation();
  const data = useLoaderData<typeof loader>();
  if (data.mode === "latest") {
    return <ReleaseNoteArticle note={data.note} />;
  }
  if (data.mode === "empty") {
    return (
      <section className="release-note-empty">
        <h1>{t("updates:title")}</h1>
        <p>{t("updates:empty")}</p>
      </section>
    );
  }
  return <SearchResults {...data} />;
}

function SearchResults({
  q,
  page,
  hits,
  totalCount,
  errorCode,
}: Extract<IndexData, { mode: "search" }>) {
  const { t, i18n } = useTranslation();
  const title = t("updates:search.title", { q });
  return (
    <section aria-label={title} className="release-note-results">
      <h1>{title}</h1>
      {errorCode ? (
        <p role="alert">{errorMessage(t, errorCode)}</p>
      ) : hits.length === 0 ? (
        <p>{t("updates:search.empty")}</p>
      ) : (
        <>
          <p>{t("updates:search.count", { count: totalCount })}</p>
          <ol className="release-note-hits">
            {hits.map((hit) => (
              <li key={hit.version}>
                <Link to={versionHref(hit.version)}>
                  v{hit.version} {hit.title}
                </Link>{" "}
                <time dateTime={hit.releaseDate}>
                  {formatDate(`${hit.releaseDate}T00:00:00Z`, i18n.language, "UTC")}
                </time>
                <p lang={hit.lang}>{hit.snippet}</p>
              </li>
            ))}
          </ol>
        </>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={SEARCH_PAGE_SIZE}
        hrefFor={(number) =>
          `/updates?q=${encodeURIComponent(q)}${number > 1 ? `&page=${number}` : ""}`
        }
      />
    </section>
  );
}
