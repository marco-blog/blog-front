import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { ReleaseNoteDetail, ReleaseNoteRevision } from "~/api/models";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";
import { notFound } from "~/updates/notFound";
import { noteReader } from "~/updates/session.server";
import { parseVersionParam, revisionHref, versionHref } from "~/updates/versionTree";

import type { Route } from "./+types/history";

/** 수정 이력(`/updates/v{version}/history`, 003 FR-162): 수정본 번호·수정 시각(관리자 이름은 없다). noindex */
export async function loader({ request, params }: Route.LoaderArgs) {
  const version = parseVersionParam(params.version);
  if (!version) {
    throw notFound();
  }
  const { language } = await noteReader(request);
  const api = createApiClient(request);
  const [note, revisions] = await Promise.all([
    api.get<ReleaseNoteDetail>(`/release-notes/${version}`, { query: { lang: language } }),
    api.get<ReleaseNoteRevision[]>(`/release-notes/${version}/revisions`),
  ]).catch(throwApiErrorResponse);
  return { version, title: note.title, revisions };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(
    loaderData ? t("updates:history.title", { version: loaderData.version }) : t("notFound.title"),
    t("appName"),
  );
}

export default function UpdatesHistory() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { version, title, revisions } = useLoaderData<typeof loader>();
  return (
    <section className="release-note-history">
      <h1>{t("updates:history.title", { version })}</h1>
      <p>
        <Link to={versionHref(version)}>
          v{version} {title}
        </Link>
      </p>
      <ol reversed aria-label={t("updates:history.list")}>
        {revisions.map((revision) => (
          <li key={revision.revisionNo}>
            <Link to={revisionHref(version, revision.revisionNo)}>
              {t("updates:history.revision", { no: revision.revisionNo })}
            </Link>{" "}
            <time dateTime={revision.editedAt}>{format.dateTime(revision.editedAt)}</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
