import { useTranslation } from "react-i18next";
import { useActionData, useLoaderData } from "react-router";

import { contentHideAction, loadContents } from "~/admin/contents.server";
import { CONTENT_PAGE_SIZE, contentHref } from "~/admin/contentSearch";
import type { AdminCommentRow } from "~/api/models";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { ContentEntryTable } from "~/components/admin/ContentEntryTable";
import { contentDoneKey } from "~/components/admin/ContentHideButton";
import { ContentSearchForm } from "~/components/admin/ContentSearchForm";
import { Pagination } from "~/components/Pagination";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/contents.comments";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:contents.title"), t("appName"));
}

/** 콘텐츠 관리 — 댓글(`/admin/contents/comments?postId=&handle=&authorId=&status=&q=&page=`, 006 T037) */
export function loader({ request }: Route.LoaderArgs) {
  return loadContents<AdminCommentRow>(request, "comments");
}

export function action({ request }: Route.ActionArgs) {
  return contentHideAction(request, "comments");
}

export default function AdminContentComments() {
  const { t } = useTranslation();
  const { filters, rows, totalCount, scopeRequired, fieldErrors, canHide } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="admin-contents">
      <h1>{t("admin:contents.title")}</h1>
      <ContentSearchForm
        key={contentHref("comments", filters)}
        kind="comments"
        filters={filters}
        scopeRequired={scopeRequired}
        fieldErrors={fieldErrors}
      />
      {result?.ok && <p role="status">{t(contentDoneKey(result.intent))}</p>}
      <AdminFormErrors error={result && !result.ok ? result : null} />
      {rows !== null &&
        (rows.length === 0 ? (
          <p>{t("admin:contents.empty")}</p>
        ) : (
          <ContentEntryTable kind="comments" rows={rows} canHide={canHide} />
        ))}
      {rows !== null && (
        <Pagination
          page={filters.page}
          totalCount={totalCount}
          pageSize={CONTENT_PAGE_SIZE}
          hrefFor={(number) => contentHref("comments", filters, number)}
        />
      )}
    </main>
  );
}
