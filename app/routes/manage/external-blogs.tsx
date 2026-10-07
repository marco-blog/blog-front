import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import type { MyExternalBlog } from "~/api/models";
import { ExternalBlogStatusBadge } from "~/components/external/ExternalBlogStatusBadge";
import { EXTERNAL_BLOG_MEMBER_LIMIT, countsTowardLimit, fetchResultLabel } from "~/external/status";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-blogs";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:manage.title"), t("appName"));
}

/**
 * 내 외부 블로그(`/:handle/manage/external-blogs`, 007 T040). 회원에 속하므로 어느 블로그의 관리 화면에서도 같은 목록이다.
 * 3개(거절·해제 제외)면 "등록 신청"을 끄고 안내한다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const blogs = await createApiClient(request)
    .get<MyExternalBlog[]>("/me/external-blogs")
    .catch(throwManageError);
  return { handle, blogs, atLimit: countsTowardLimit(blogs) >= EXTERNAL_BLOG_MEMBER_LIMIT };
}

export default function ManageExternalBlogs() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { handle, blogs, atLimit } = useLoaderData<typeof loader>();
  const base = `/${handle}/manage/external-blogs`;
  return (
    <main className="manage-external-blogs">
      <h1>{t("external:manage.title")}</h1>
      <p>{t("external:manage.intro")}</p>
      <ul className="form-hint">
        <li>{t("external:manage.guide1")}</li>
        <li>{t("external:manage.guide2")}</li>
        <li>{t("external:manage.guide3")}</li>
      </ul>
      <p>
        {atLimit ? (
          <button type="button" disabled aria-describedby="external-limit">
            {t("external:manage.apply")}
          </button>
        ) : (
          <Link className="button" to={`${base}/new`}>
            {t("external:manage.apply")}
          </Link>
        )}{" "}
        <span id="external-limit" className="field-hint">
          {t("external:manage.limit", { max: EXTERNAL_BLOG_MEMBER_LIMIT })}
        </span>
      </p>
      {blogs.length === 0 ? (
        <p>{t("external:manage.empty")}</p>
      ) : (
        <table className="manage-table" aria-label={t("external:manage.listLabel")}>
          <thead>
            <tr>
              <th>{t("external:common.name")}</th>
              <th>{t("external:common.feedUrl")}</th>
              <th>{t("external:common.status")}</th>
              <th>{t("external:common.verified")}</th>
              <th>{t("external:common.lastFetch")}</th>
              <th>{t("external:common.posts")}</th>
            </tr>
          </thead>
          <tbody>
            {blogs.map((blog) => (
              <tr key={blog.id}>
                <td>
                  <Link to={`${base}/${blog.id}`}>
                    {blog.title ?? t("external:common.untitled")}
                  </Link>
                </td>
                <td>
                  <code>{blog.feedUrl}</code>
                </td>
                <td>
                  <ExternalBlogStatusBadge blog={blog} />
                  {blog.status === "REJECTED" && blog.rejectReason && (
                    <p className="field-hint">
                      {t("external:manage.detail.guideREJECTED", { reason: blog.rejectReason })}
                    </p>
                  )}
                </td>
                <td>
                  {blog.ownershipVerified
                    ? t("external:common.verified")
                    : t("external:common.notVerified")}
                </td>
                <td>
                  {blog.lastFetchedAt ? (
                    <>
                      {format.dateTime(blog.lastFetchedAt)} ·{" "}
                      {fetchResultLabel(t, blog.lastFetchResult)}
                    </>
                  ) : (
                    t("external:common.never")
                  )}
                </td>
                <td>{t("external:common.postCount", { count: blog.postCount })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
