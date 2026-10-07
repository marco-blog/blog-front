import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { adminNotFound, requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import type { AdminReleaseNote, AdminRevision } from "~/api/models";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/release-note-revisions";
import { RELEASE_NOTES_PATH } from "./release-notes";

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(
    t("admin:releaseNotes.revisions.title", { version: loaderData?.note.version ?? "" }),
    t("appName"),
  );
}

/** 수정본 목록(`/admin/release-notes/:id/revisions`, 006 T063): 번호·수정한 관리자·시각·당시 상태 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  if (!/^\d{1,18}$/.test(params.id)) {
    throw adminNotFound();
  }
  const api = createApiClient(request);
  const [note, revisions] = await Promise.all([
    api.get<AdminReleaseNote>(`${RELEASE_NOTES_PATH}/${params.id}`),
    api.get<AdminRevision[]>(`${RELEASE_NOTES_PATH}/${params.id}/revisions`),
  ]).catch(throwAdminError);
  return { note, revisions };
}

export default function AdminReleaseNoteRevisions() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { note, revisions } = useLoaderData<typeof loader>();
  const base = `${RELEASE_NOTES_PATH}/${note.id}`;
  return (
    <main className="admin-release-note-revisions">
      <h1>{t("admin:releaseNotes.revisions.title", { version: note.version })}</h1>
      {revisions.length === 0 ? (
        <p>{t("admin:releaseNotes.revisions.empty")}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table" aria-label={t("admin:releaseNotes.revisions.list")}>
            <thead>
              <tr>
                <th scope="col">{t("admin:releaseNotes.revisions.columns.no")}</th>
                <th scope="col">{t("admin:releaseNotes.revisions.columns.editedBy")}</th>
                <th scope="col">{t("admin:releaseNotes.revisions.columns.editedAt")}</th>
                <th scope="col">{t("admin:releaseNotes.revisions.columns.status")}</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((revision) => (
                <tr key={revision.revisionNo}>
                  <td>
                    <Link to={`${base}/revisions/${revision.revisionNo}`}>
                      {t("admin:releaseNotes.editor.revision", { no: revision.revisionNo })}
                    </Link>
                  </td>
                  <td>{revision.editedBy.nickname}</td>
                  <td>{format.dateTime(revision.editedAt)}</td>
                  <td>{t(`admin:releaseNotes.status.${revision.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        <Link to={base}>{t("admin:releaseNotes.revisions.back")}</Link>
      </p>
    </main>
  );
}
