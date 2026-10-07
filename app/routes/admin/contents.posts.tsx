import { useTranslation } from "react-i18next";
import { Link, useActionData, useLoaderData } from "react-router";

import { contentHideAction, loadContents } from "~/admin/contents.server";
import { CONTENT_PAGE_SIZE, contentHref } from "~/admin/contentSearch";
import type { AdminPostRow } from "~/api/models";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { ContentHideButton, contentDoneKey } from "~/components/admin/ContentHideButton";
import { ContentSearchForm, useContentStatus } from "~/components/admin/ContentSearchForm";
import { Pagination } from "~/components/Pagination";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/contents.posts";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:contents.title"), t("appName"));
}

/** 콘텐츠 관리 — 글(`/admin/contents/posts?q=&handle=&authorId=&status=&visibility=&page=`, 006 T037) */
export function loader({ request }: Route.LoaderArgs) {
  return loadContents<AdminPostRow>(request, "posts");
}

export function action({ request }: Route.ActionArgs) {
  return contentHideAction(request, "posts");
}

export default function AdminContentPosts() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const status = useContentStatus("posts");
  const { kind, filters, rows, totalCount, scopeRequired, fieldErrors, canHide } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="admin-contents">
      <h1>{t("admin:contents.title")}</h1>
      <ContentSearchForm
        key={contentHref(kind, filters)}
        kind={kind}
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
          <div className="table-scroll">
            <table className="admin-table" aria-label={t("admin:contents.list")}>
              <thead>
                <tr>
                  <th>{t("admin:contents.columns.title")}</th>
                  <th>{t("admin:contents.columns.blog")}</th>
                  <th>{t("admin:contents.columns.author")}</th>
                  <th>{t("admin:contents.columns.status")}</th>
                  <th>{t("admin:contents.columns.visibility")}</th>
                  <th>{t("admin:contents.columns.publishedAt")}</th>
                  <th>{t("admin:contents.columns.commentCount")}</th>
                  {canHide && <th>{t("admin:contents.columns.actions")}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <Link to={`/${post.blog.handle}/${post.id}`}>
                        {post.title || `#${post.id}`}
                      </Link>
                    </td>
                    <td>
                      {post.blog.title} ({post.blog.handle})
                      {post.blog.status === "DELETED" && ` · ${t("admin:contents.deletedBlog")}`}
                    </td>
                    <td>
                      <Link to={`/admin/users/${post.author.userId}`}>{post.author.nickname}</Link>
                    </td>
                    <td>{status(post.status)}</td>
                    <td>{t(`manage:visibility.${post.visibility}`)}</td>
                    <td>
                      {post.publishedAt
                        ? format.dateTime(post.publishedAt)
                        : t("admin:contents.notPublished")}
                    </td>
                    <td>{format.number(post.commentCount)}</td>
                    {canHide && (
                      <td>
                        <ContentHideButton id={post.id} status={post.status} label={post.title} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {rows !== null && (
        <Pagination
          page={filters.page}
          totalCount={totalCount}
          pageSize={CONTENT_PAGE_SIZE}
          hrefFor={(number) => contentHref(kind, filters, number)}
        />
      )}
    </main>
  );
}
