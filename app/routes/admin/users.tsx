import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import type { AdminUserSummary } from "~/api/models";
import { parsePage } from "~/blog/listing";
import {
  USER_QUERY_MIN,
  USER_SEARCH_BY,
  UserSearch,
  type UserSearchBy,
} from "~/components/admin/UserSearch";
import { Pagination } from "~/components/Pagination";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/users";

export const USER_PAGE_SIZE = 20;
const PATH = "/admin/users";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:users.title"), t("appName"));
}

export function usersHref(q: string, by: UserSearchBy, page = 1): string {
  const params = new URLSearchParams({ q, by });
  if (page > 1) params.set("page", String(page));
  return `${PATH}?${params}`;
}

/**
 * 회원 관리(`/admin/users?q=&by=&page=`, 005 T061, FR-042): 검색어가 2자 이상일 때만 `GET /admin/users`를 부른다.
 * 결과 표는 닉네임(상세 링크)·상태·권한·가입일·블로그 수. 이메일은 받지도 보여주지도 않는다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const q = (search.get("q") ?? "").trim();
  const byText = search.get("by") ?? "nickname";
  const by: UserSearchBy = (USER_SEARCH_BY as readonly string[]).includes(byText)
    ? (byText as UserSearchBy)
    : "nickname";
  const page = parsePage(search.get("page"));
  if (q.length < USER_QUERY_MIN) {
    return { q, by, page, users: null, totalCount: 0, tooShort: q.length > 0 };
  }
  const response = await createApiClient(request)
    .send<AdminUserSummary[]>("/admin/users", {
      query: { q, by, page: page - 1, size: USER_PAGE_SIZE },
    })
    .catch(throwAdminError);
  return {
    q,
    by,
    page,
    users: response.result,
    totalCount: response.totalCount ?? response.result.length,
    tooShort: false,
  };
}

export default function AdminUsers() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { q, by, page, users, totalCount, tooShort } = useLoaderData<typeof loader>();
  return (
    <main className="admin-users">
      <h1>{t("admin:users.title")}</h1>
      <UserSearch
        key={`${by}-${q}`}
        q={q}
        by={by}
        error={tooShort ? t("errors:fieldErrors.TOO_SHORT", { min: USER_QUERY_MIN }) : null}
      />
      {users !== null &&
        (users.length === 0 ? (
          <p>{t("admin:users.empty")}</p>
        ) : (
          <table className="admin-table" aria-label={t("admin:users.list")}>
            <thead>
              <tr>
                <th>{t("admin:users.columns.nickname")}</th>
                <th>{t("admin:users.columns.status")}</th>
                <th>{t("admin:users.columns.role")}</th>
                <th>{t("admin:users.columns.createdAt")}</th>
                <th>{t("admin:users.columns.blogCount")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link to={`${PATH}/${user.id}`}>{user.nickname}</Link>
                  </td>
                  <td>{t(`admin:users.status.${user.status}`)}</td>
                  <td>{t(`admin:users.role.${user.role}`)}</td>
                  <td>{format.date(user.createdAt)}</td>
                  <td>{user.blogCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      {users !== null && (
        <Pagination
          page={page}
          totalCount={totalCount}
          pageSize={USER_PAGE_SIZE}
          hrefFor={(number) => usersHref(q, by, number)}
        />
      )}
    </main>
  );
}
