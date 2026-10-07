import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { ReleaseNoteDetail } from "~/api/models";
import { LanguageEditionNotice } from "~/components/updates/LanguageEditionNotice";
import { Toc } from "~/components/updates/Toc";
import { publicOrigin } from "~/config.server";
import { formatDate } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { pageMeta, privatePageMeta } from "~/seo/meta";
import { notFound } from "~/updates/notFound";
import { noteReader } from "~/updates/session.server";
import {
  historyHref,
  parseVersionParam,
  plainTextExcerpt,
  versionHref,
} from "~/updates/versionTree";

import type { Route } from "./+types/version";

/**
 * 버전 페이지(`/updates/v{version}`, 003 T124, FR-159·160·162): 본문(제목마다 앵커)·목차·대체 언어판 안내·이전·다음 버전,
 * 수정본이 2개 이상이면 "수정 이력". 로그인 회원이면 마지막 확인 버전을 갱신한다(실패해도 화면은 그린다).
 * 형식이 틀리거나 없는(초안 포함) 버전은 404.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const version = parseVersionParam(params.version);
  if (!version) {
    throw notFound();
  }
  const { language, user } = await noteReader(request);
  const api = createApiClient(request);
  const note = await api
    .get<ReleaseNoteDetail>(`/release-notes/${version}`, { query: { lang: language } })
    .catch(throwApiErrorResponse);
  if (user) {
    await api.post("/me/release-notes/seen", { body: { version } }).catch(() => null);
  }
  return { note, origin: publicOrigin(request) };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const { note, origin } = loaderData;
  return pageMeta({
    title: `${note.title} - ${t("appName")}`,
    description: plainTextExcerpt(note.contentHtml),
    url: `${origin}${versionHref(note.version)}`,
    type: "article",
    siteName: t("appName"),
  });
}

export default function UpdatesVersion() {
  const { note } = useLoaderData<typeof loader>();
  return <ReleaseNoteArticle note={note} />;
}

/**
 * 릴리스 노트 본문. backend가 살균한 HTML(제목 id 포함)을 그대로 넣는다(001 R27 예외 파일, 003 contracts/routes.md).
 * `/updates`(최신 버전)와 이전 수정본 화면도 이 컴포넌트를 쓴다.
 */
export function ReleaseNoteArticle({
  note,
  notice,
}: {
  note: ReleaseNoteDetail;
  /** 본문 위 안내(이전 수정본 등) */
  notice?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  return (
    <article className="release-note" lang={note.lang}>
      <header>
        <p className="release-note-version">v{note.version}</p>
        <h1>{note.title}</h1>
        <p>
          <time dateTime={note.releaseDate}>
            {t("updates:releaseDate", {
              // 릴리스 날짜는 시각 없는 날짜라 UTC 자정으로 읽어 그대로 보여준다.
              date: formatDate(`${note.releaseDate}T00:00:00Z`, i18n.language, "UTC"),
            })}
          </time>
        </p>
        {notice}
        <LanguageEditionNotice requested={note.requestedLang} shown={note.lang} />
      </header>
      <Toc toc={note.toc} />
      <div
        className="release-note-content"
        dangerouslySetInnerHTML={{ __html: note.contentHtml }}
      />
      <footer>
        {note.revisionCount >= 2 && notice === undefined && (
          <p>
            <Link to={historyHref(note.version)}>{t("updates:history.link")}</Link>
          </p>
        )}
        {(note.prev || note.next) && (
          <nav aria-label={t("updates:versionNav")} className="release-note-nav">
            {note.prev && (
              <Link to={versionHref(note.prev.version)} rel="prev">
                {t("updates:prev")}: v{note.prev.version} {note.prev.title}
              </Link>
            )}{" "}
            {note.next && (
              <Link to={versionHref(note.next.version)} rel="next">
                {t("updates:next")}: v{note.next.version} {note.next.title}
              </Link>
            )}
          </nav>
        )}
      </footer>
    </article>
  );
}
