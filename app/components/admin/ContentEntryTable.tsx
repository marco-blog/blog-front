import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { ContentKind } from "~/admin/contentSearch";
import type { AdminCommentRow, AdminGuestbookRow } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

import { ContentHideButton } from "./ContentHideButton";
import { useContentStatus } from "./ContentSearchForm";

type EntryRow = AdminGuestbookRow & Partial<Pick<AdminCommentRow, "postId" | "postTitle">>;

/** 댓글·방명록 글의 원래 자리(앵커) */
export function entryHref(kind: ContentKind, row: EntryRow): string {
  return kind === "comments"
    ? `/${row.blogHandle}/${row.postId}#comment-${row.id}`
    : `/${row.blogHandle}/guestbook#guestbook-${row.id}`;
}

/**
 * 콘텐츠 관리 — 댓글·방명록 표(006 T037): 내용 앞 200자(비밀 댓글은 "비밀 댓글"), 원래 자리 링크, 작성자(회원 → 회원 상세,
 * 비회원 → "비회원 {이름}"), 상태, 작성 시각, 숨김·해제(005 숨김 API).
 */
export function ContentEntryTable({
  kind,
  rows,
}: {
  kind: "comments" | "guestbook";
  rows: readonly EntryRow[];
}) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const status = useContentStatus(kind);
  return (
    <div className="table-scroll">
      <table className="admin-table" aria-label={t("admin:contents.list")}>
        <thead>
          <tr>
            <th>{t("admin:contents.columns.content")}</th>
            <th>
              {t(
                kind === "comments" ? "admin:contents.columns.post" : "admin:contents.columns.blog",
              )}
            </th>
            <th>{t("admin:contents.columns.author")}</th>
            <th>{t("admin:contents.columns.status")}</th>
            <th>{t("admin:contents.columns.createdAt")}</th>
            <th>{t("admin:contents.columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const content =
              row.secret || row.content === null ? t("admin:contents.secret") : row.content;
            return (
              <tr key={row.id}>
                <td>
                  <Link to={entryHref(kind, row)}>{content}</Link>
                </td>
                <td>{kind === "comments" ? row.postTitle : row.blogHandle}</td>
                <td>
                  {row.author ? (
                    <Link to={`/admin/users/${row.author.userId}`}>{row.author.nickname}</Link>
                  ) : (
                    t("admin:contents.guest", { name: row.guestName ?? "" })
                  )}
                </td>
                <td>{status(row.status)}</td>
                <td>{format.dateTime(row.createdAt)}</td>
                <td>
                  <ContentHideButton id={row.id} status={row.status} label={content} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
