import { useTranslation } from "react-i18next";
import { Form, Link, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import {
  EXTERNAL_BLOG_STATUSES,
  type AdminExternalBlog,
  type ExternalBlogStatus,
} from "~/api/models";
import { parsePage } from "~/blog/listing";
import { AdminExternalTabs } from "~/components/external/AdminExternalTabs";
import { ExternalBlogStatusBadge } from "~/components/external/ExternalBlogStatusBadge";
import { Pagination } from "~/components/Pagination";
import { fetchResultLabel } from "~/external/status";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-blogs";

export const ADMIN_EXTERNAL_PAGE_SIZE = 20;
export const ADMIN_EXTERNAL_QUERY_MIN = 2;
const PATH = "/admin/external-blogs";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:admin.list.title"), t("appName"));
}

export function externalBlogsHref(status: ExternalBlogStatus | null, q: string, page = 1): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${PATH}?${query}` : PATH;
}

function parseStatus(value: string | null): ExternalBlogStatus | null {
  return (EXTERNAL_BLOG_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as ExternalBlogStatus)
    : null;
}

/**
 * 외부 블로그 관리 목록(`/admin/external-blogs?status=&q=&page=`, 007 T041): 상태 탭(승인 대기(수) 먼저), 제목·피드 주소 검색(2자 이상),
 * 표, "직접 등록". 전체 탭은 승인 대기를 먼저 보인다(backend 정렬). 승인 대기 수는 `size=1`의 `totalCount`.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const status = parseStatus(search.get("status"));
  const rawQ = (search.get("q") ?? "").trim();
  const q = rawQ.length >= ADMIN_EXTERNAL_QUERY_MIN ? rawQ.slice(0, 100) : "";
  const page = parsePage(search.get("page"));
  const api = createApiClient(request);
  const [list, pending] = await Promise.all([
    api.send<AdminExternalBlog[]>("/admin/external-blogs", {
      query: {
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
        page: page - 1,
        size: ADMIN_EXTERNAL_PAGE_SIZE,
      },
    }),
    api.send<AdminExternalBlog[]>("/admin/external-blogs", {
      query: { status: "PENDING", size: 1 },
    }),
  ]).catch(throwAdminError);
  return {
    status,
    q,
    tooShort: rawQ.length > 0 && rawQ.length < ADMIN_EXTERNAL_QUERY_MIN,
    page,
    blogs: list.result,
    totalCount: list.totalCount ?? list.result.length,
    pendingCount: pending.totalCount ?? pending.result.length,
  };
}

export default function AdminExternalBlogs() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { status, q, tooShort, page, blogs, totalCount, pendingCount } =
    useLoaderData<typeof loader>();
  const tabs: (ExternalBlogStatus | null)[] = [...EXTERNAL_BLOG_STATUSES, null];
  return (
    <main className="admin-external-blogs">
      <AdminExternalTabs />
      <h1>{t("external:admin.list.title")}</h1>
      <p>
        <Link className="button" to={`${PATH}/new`}>
          {t("external:admin.list.create")}
        </Link>
      </p>
      <nav className="status-tabs" aria-label={t("external:common.status")}>
        <ul>
          {tabs.map((tab) => {
            const label = t(`external:status.${tab ?? "ALL"}`);
            return (
              <li key={tab ?? "ALL"}>
                <Link
                  to={externalBlogsHref(tab, q)}
                  aria-current={tab === status ? "page" : undefined}
                >
                  {tab === "PENDING"
                    ? t("external:admin.list.tabCount", { label, count: pendingCount })
                    : label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Form method="get" action={PATH} className="admin-search">
        {status && <input type="hidden" name="status" value={status} />}
        <label htmlFor="external-q">{t("external:admin.list.search")}</label>
        <input id="external-q" name="q" type="search" defaultValue={q} maxLength={100} />
        <button type="submit">{t("external:admin.list.searchSubmit")}</button>
        {tooShort && (
          <p className="field-error" role="alert">
            {t("errors:fieldErrors.TOO_SHORT", { min: ADMIN_EXTERNAL_QUERY_MIN })}
          </p>
        )}
      </Form>
      {blogs.length === 0 ? (
        <p>{t("external:admin.list.empty")}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table" aria-label={t("external:admin.list.title")}>
            <thead>
              <tr>
                <th>{t("external:common.name")}</th>
                <th>{t("external:common.feedUrl")}</th>
                <th>{t("external:common.registrationType")}</th>
                <th>{t("external:common.member")}</th>
                <th>{t("external:common.verified")}</th>
                <th>{t("external:common.status")}</th>
                <th>{t("external:common.lastFetch")}</th>
                <th>{t("external:admin.list.failures")}</th>
                <th>{t("external:admin.list.pendingReviews")}</th>
              </tr>
            </thead>
            <tbody>
              {blogs.map((blog) => (
                <tr key={blog.id}>
                  <td>
                    <Link to={`${PATH}/${blog.id}`}>
                      {blog.title ?? t("external:common.untitled")}
                    </Link>
                  </td>
                  <td>
                    <code>{blog.feedUrl}</code>
                  </td>
                  <td>{t(`external:registrationType.${blog.registrationType}`)}</td>
                  <td>{blog.member?.nickname ?? "-"}</td>
                  <td>
                    {blog.ownershipVerified
                      ? t("external:common.verified")
                      : t("external:common.notVerified")}
                  </td>
                  <td>
                    <ExternalBlogStatusBadge blog={blog} />
                  </td>
                  <td>
                    {blog.lastFetchedAt
                      ? `${format.dateTime(blog.lastFetchedAt)} · ${fetchResultLabel(t, blog.lastFetchResult)}`
                      : t("external:common.never")}
                  </td>
                  <td>{blog.consecutiveFailures}</td>
                  <td>{blog.pendingReviewCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={ADMIN_EXTERNAL_PAGE_SIZE}
        hrefFor={(target) => externalBlogsHref(status, q, target)}
      />
    </main>
  );
}
