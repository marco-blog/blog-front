import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import type { AdminReleaseNoteSummary, ReleaseNoteStatus } from "~/api/models";
import { parsePage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { formatDate, useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { oneOf } from "~/manage/postFilters";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/release-notes";

export const RELEASE_NOTES_PATH = "/admin/release-notes";
export const RELEASE_NOTE_PAGE_SIZE = 20;
const STATUSES: readonly ReleaseNoteStatus[] = ["DRAFT", "PUBLISHED"];

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:releaseNotes.title"), t("appName"));
}

export function releaseNotesHref(status: ReleaseNoteStatus | null, page = 1): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${RELEASE_NOTES_PATH}?${query}` : RELEASE_NOTES_PATH;
}

/** 릴리스 노트 날짜(시각 없는 `YYYY-MM-DD`)는 UTC 자정으로 읽어 그대로 보여준다(003 `updates`와 같음). */
export function releaseDateText(date: string, language: string): string {
  return formatDate(`${date}T00:00:00Z`, language, "UTC");
}

/**
 * 릴리스 노트 목록(`/admin/release-notes?status=&page=`, 006 FR-107, T061): 상태 탭(전체·초안·게시), 버전·상태·릴리스 날짜·
 * 언어판·수정본 번호·게시 시각, "새 노트".
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const status = oneOf(STATUSES, search.get("status"));
  const page = parsePage(search.get("page"));
  const response = await createApiClient(request)
    .send<AdminReleaseNoteSummary[]>(RELEASE_NOTES_PATH, {
      query: { ...(status ? { status } : {}), page: page - 1, size: RELEASE_NOTE_PAGE_SIZE },
    })
    .catch(throwAdminError);
  return {
    status,
    page,
    notes: response.result,
    totalCount: response.totalCount ?? response.result.length,
  };
}

export default function AdminReleaseNotes() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { status, page, notes, totalCount } = useLoaderData<typeof loader>();
  const tabs: [ReleaseNoteStatus | null, string][] = [
    [null, t("admin:releaseNotes.tabs.all")],
    ["DRAFT", t("admin:releaseNotes.tabs.DRAFT")],
    ["PUBLISHED", t("admin:releaseNotes.tabs.PUBLISHED")],
  ];
  return (
    <main className="admin-release-notes">
      <h1>{t("admin:releaseNotes.title")}</h1>
      <p>
        <Link to={`${RELEASE_NOTES_PATH}/new`}>{t("admin:releaseNotes.new")}</Link>
      </p>
      <nav aria-label={t("admin:releaseNotes.tabs.label")} className="admin-tabs">
        <ul>
          {tabs.map(([value, label]) => (
            <li key={value ?? "all"}>
              {/* 탭은 쿼리만 달라 NavLink의 경로 비교를 쓸 수 없다. */}
              <Link
                to={releaseNotesHref(value)}
                aria-current={status === value ? "page" : undefined}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {notes.length === 0 ? (
        <p>{t("admin:releaseNotes.empty")}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table" aria-label={t("admin:releaseNotes.list")}>
            <thead>
              <tr>
                <th scope="col">{t("admin:releaseNotes.columns.version")}</th>
                <th scope="col">{t("admin:releaseNotes.columns.status")}</th>
                <th scope="col">{t("admin:releaseNotes.columns.releaseDate")}</th>
                <th scope="col">{t("admin:releaseNotes.columns.langs")}</th>
                <th scope="col">{t("admin:releaseNotes.columns.revisionNo")}</th>
                <th scope="col">{t("admin:releaseNotes.columns.publishedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((note) => (
                <tr key={note.id}>
                  <td>
                    <Link to={`${RELEASE_NOTES_PATH}/${note.id}`}>{note.version}</Link>
                  </td>
                  <td>
                    <span className={`badge badge-${note.status.toLowerCase()}`}>
                      {t(`admin:releaseNotes.status.${note.status}`)}
                    </span>
                  </td>
                  <td>{releaseDateText(note.releaseDate, i18n.language)}</td>
                  <td>{note.langs.join(", ")}</td>
                  <td>{note.revisionNo}</td>
                  <td>
                    {note.publishedAt
                      ? format.dateTime(note.publishedAt)
                      : t("admin:releaseNotes.notPublished")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={RELEASE_NOTE_PAGE_SIZE}
        hrefFor={(number) => releaseNotesHref(status, number)}
      />
    </main>
  );
}
