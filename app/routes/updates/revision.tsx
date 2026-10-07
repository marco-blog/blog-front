import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { ReleaseNoteDetail } from "~/api/models";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";
import { notFound } from "~/updates/notFound";
import { noteReader } from "~/updates/session.server";
import {
  historyHref,
  parseRevisionNo,
  parseVersionParam,
  versionHref,
} from "~/updates/versionTree";

import type { Route } from "./+types/revision";
import { ReleaseNoteArticle } from "./version";

/**
 * 이전 수정본(`/updates/v{version}/history/{revisionNo}`, 003 FR-162): 그 수정본의 언어판 본문과 "이전 수정본입니다" 안내,
 * 현재 버전 링크. noindex. 본문은 backend가 살균한 HTML이다(001 R27 예외 파일).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const version = parseVersionParam(params.version);
  const revisionNo = parseRevisionNo(params.revisionNo);
  if (!version || revisionNo === null) {
    throw notFound();
  }
  const { language } = await noteReader(request);
  const note = await createApiClient(request)
    .get<ReleaseNoteDetail>(`/release-notes/${version}/revisions/${revisionNo}`, {
      query: { lang: language },
    })
    .catch(throwApiErrorResponse);
  return { note, revisionNo };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(
    loaderData
      ? t("updates:history.revisionTitle", {
          version: loaderData.note.version,
          no: loaderData.revisionNo,
        })
      : t("notFound.title"),
    t("appName"),
  );
}

export default function UpdatesRevision() {
  const { t } = useTranslation();
  const { note, revisionNo } = useLoaderData<typeof loader>();
  return (
    <ReleaseNoteArticle
      note={note}
      notice={
        <div role="note" className="old-revision-notice">
          <p>{t("updates:history.old", { no: revisionNo })}</p>
          <p>
            <Link to={versionHref(note.version)}>{t("updates:history.current")}</Link>{" "}
            <Link to={historyHref(note.version)}>{t("updates:history.link")}</Link>
          </p>
        </div>
      }
    />
  );
}
