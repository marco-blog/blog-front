import { useTranslation } from "react-i18next";
import { useActionData, useLoaderData } from "react-router";

import { contentHideAction, loadContents } from "~/admin/contents.server";
import { CONTENT_PAGE_SIZE, contentHref } from "~/admin/contentSearch";
import type { AdminGuestbookRow } from "~/api/models";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { ContentEntryTable } from "~/components/admin/ContentEntryTable";
import { contentDoneKey } from "~/components/admin/ContentHideButton";
import { ContentSearchForm } from "~/components/admin/ContentSearchForm";
import { Pagination } from "~/components/Pagination";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/contents.guestbook";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:contents.title"), t("appName"));
}

/** 콘텐츠 관리 — 방명록(`/admin/contents/guestbook?handle=&authorId=&status=&q=&page=`, 006 T037) */
export function loader({ request }: Route.LoaderArgs) {
  return loadContents<AdminGuestbookRow>(request, "guestbook");
}

export function action({ request }: Route.ActionArgs) {
  return contentHideAction(request, "guestbook");
}

export default function AdminContentGuestbook() {
  const { t } = useTranslation();
  const { filters, rows, totalCount, scopeRequired, fieldErrors } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="admin-contents">
      <h1>{t("admin:contents.title")}</h1>
      <ContentSearchForm
        key={contentHref("guestbook", filters)}
        kind="guestbook"
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
          <ContentEntryTable kind="guestbook" rows={rows} />
        ))}
      {rows !== null && (
        <Pagination
          page={filters.page}
          totalCount={totalCount}
          pageSize={CONTENT_PAGE_SIZE}
          hrefFor={(number) => contentHref("guestbook", filters, number)}
        />
      )}
    </main>
  );
}
