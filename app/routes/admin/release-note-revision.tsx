import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { adminNotFound, requireAdmin, throwAdminError } from "~/admin/access.server";
import { RELEASE_NOTE_LANGS } from "~/admin/releaseNoteForm";
import { createApiClient } from "~/api/client.server";
import type { AdminRevision } from "~/api/models";
import { languageName } from "~/components/admin/LanguageTabs";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/release-note-revision";
import { RELEASE_NOTES_PATH, releaseDateText } from "./release-notes";

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(
    t("admin:releaseNotes.revision.title", {
      no: loaderData?.revision.revisionNo ?? "",
      version: loaderData?.revision.version ?? "",
    }),
    t("appName"),
  );
}

/**
 * 수정본 보기(`/admin/release-notes/:id/revisions/:revisionNo`, 006 T063): 버전·날짜·언어판별 제목·Markdown 원문(읽기 전용),
 * "이 내용으로 편집기 채우기"(`/admin/release-notes/{id}?fromRevision={no}`).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  if (!/^\d{1,18}$/.test(params.id) || !/^\d{1,9}$/.test(params.revisionNo)) {
    throw adminNotFound();
  }
  const revision = await createApiClient(request)
    .get<AdminRevision>(`${RELEASE_NOTES_PATH}/${params.id}/revisions/${params.revisionNo}`)
    .catch(throwAdminError);
  return { id: Number(params.id), revision };
}

export default function AdminReleaseNoteRevision() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { id, revision } = useLoaderData<typeof loader>();
  const base = `${RELEASE_NOTES_PATH}/${id}`;
  const contents = revision.contents ?? {};
  return (
    <main className="admin-release-note-revision">
      <h1>
        {t("admin:releaseNotes.revision.title", {
          no: revision.revisionNo,
          version: revision.version ?? "",
        })}
      </h1>
      <p className="form-hint">{t("admin:releaseNotes.revision.readOnly")}</p>
      <ul>
        <li>
          {t("admin:releaseNotes.revision.editedBy", {
            nickname: revision.editedBy.nickname,
            time: format.dateTime(revision.editedAt),
          })}{" "}
          · {t(`admin:releaseNotes.status.${revision.status}`)}
        </li>
        {revision.releaseDate && (
          <li>
            {t("admin:releaseNotes.editor.releaseDate")}:{" "}
            {releaseDateText(revision.releaseDate, i18n.language)}
          </li>
        )}
      </ul>
      {RELEASE_NOTE_LANGS.filter((lang) => contents[lang]).map((lang) => (
        <section key={lang} aria-label={languageName(lang)}>
          <h2>
            {languageName(lang)}: {contents[lang].title}
          </h2>
          <pre className="release-note-source">{contents[lang].contentMarkdown}</pre>
        </section>
      ))}
      <p>
        <Link to={`${base}?fromRevision=${revision.revisionNo}`}>
          {t("admin:releaseNotes.revision.fill")}
        </Link>{" "}
        · <Link to={`${base}/revisions`}>{t("admin:releaseNotes.revision.back")}</Link>
      </p>
    </main>
  );
}
