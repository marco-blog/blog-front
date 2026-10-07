import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { contentPath } from "~/admin/contentSearch";
import { roleChangeAction } from "~/admin/roleChange.server";
import { isSuperAdmin } from "~/admin/roles";
import { createApiClient } from "~/api/client.server";
import type { AdminUserDetail } from "~/api/models";
import { parsePostId } from "~/blog/ids";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { RoleForm } from "~/components/admin/RoleForm";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/user";

/** backend `SuspensionService.REASON_MAX`와 같다 */
export const SUSPEND_REASON_MAX = 500;
const INTENTS = ["suspend", "unsuspend", "blogLimit", "role"] as const;
type Intent = (typeof INTENTS)[number];

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:user.title"), t("appName"));
}

/** 이 회원의 글·댓글(006 콘텐츠 관리, T039)과 이 회원 대상 작업 기록(006 작업 기록, T055) 주소 */
export function memberLinks(id: number) {
  return {
    posts: `${contentPath("posts")}?authorId=${id}`,
    comments: `${contentPath("comments")}?authorId=${id}`,
    auditLog: `/admin/audit-log?targetType=USER&targetId=${id}`,
  };
}

/**
 * 회원 상세(`/admin/users/:id`, 005 T061, 006 FR-104·105): 가입일·상태·권한·글 수·받은 신고·최근 로그인·블로그·한도,
 * "이 회원의 글·댓글", "관리자 권한"(최고 관리자만 바꾸기, 006 T055)
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const viewer = await requireAdmin(request);
  const id = parsePostId(params.id);
  if (id === null) {
    throw data(null, { status: 404 });
  }
  const user = await createApiClient(request)
    .get<AdminUserDetail>(`/admin/users/${id}`)
    .catch(throwAdminError);
  return { user, canChangeRole: isSuperAdmin(viewer.role) };
}

/**
 * - `intent=suspend`: 사유 필수(500자) → POST /admin/users/{id}/suspend
 * - `intent=unsuspend`: 메모 선택 → POST /admin/users/{id}/unsuspend
 * - `intent=blogLimit`: 한도(0 이상 정수), `reset`이면 기본값(null) → PATCH /admin/users/{id}/blog-limit (003)
 * - `intent=role`: 권한 + 확인 체크 → PUT /admin/users/{id}/role (006 T055, 최고 관리자만 — 아니면 backend 403)
 */
export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const id = parsePostId(params.id);
  if (id === null) {
    throw data(null, { status: 404 });
  }
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  if (!(INTENTS as readonly string[]).includes(intentText)) {
    return adminInvalid(intentText);
  }
  const intent = intentText as Intent;
  if (intent === "role") {
    return roleChangeAction(request, intent, form, String(id));
  }
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length > SUSPEND_REASON_MAX) {
    return adminInvalid(intent, [
      { field: "reason", code: "TOO_LONG", params: { max: SUSPEND_REASON_MAX } },
    ]);
  }
  const api = createApiClient(request);
  try {
    if (intent === "suspend") {
      if (!reason) {
        return adminInvalid(intent, [{ field: "reason", code: "REQUIRED" }]);
      }
      await api.post(`/admin/users/${id}/suspend`, { body: { reason } });
    } else if (intent === "unsuspend") {
      await api.post(`/admin/users/${id}/unsuspend`, { body: reason ? { reason } : {} });
    } else {
      const reset = form.get("reset") !== null;
      const text = String(form.get("maxBlogs") ?? "").trim();
      if (!reset && !/^\d{1,6}$/.test(text)) {
        return adminInvalid(intent, [{ field: "maxBlogs", code: "INVALID_FORMAT" }]);
      }
      await api.patch(`/admin/users/${id}/blog-limit`, {
        body: { maxBlogs: reset ? null : Number(text) },
      });
    }
  } catch (error) {
    return adminActionError(intent, error);
  }
  return data<AdminActionData>({ intent, ok: true });
}

export default function AdminUser() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { user, canChangeRole } = useLoaderData<typeof loader>();
  const links = memberLinks(user.id);
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";
  const confirmSuspend = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(t("admin:user.suspend.confirm"))) {
      event.preventDefault();
    }
  };

  return (
    <main className="admin-user">
      <p>
        <Link to="/admin/users">{t("admin:users.title")}</Link>
      </p>
      <h1>
        {t("admin:user.title")}: {user.nickname}
      </h1>
      {result?.ok && <p role="status">{t(`admin:user.done.${result.intent}`)}</p>}
      <AdminFormErrors error={result && !result.ok ? result : null} />

      <dl className="admin-user-facts">
        <dt>{t("admin:user.createdAt")}</dt>
        <dd>{format.date(user.createdAt)}</dd>
        <dt>{t("admin:user.status")}</dt>
        <dd>{t(`admin:users.status.${user.status}`)}</dd>
        <dt>{t("admin:user.role")}</dt>
        <dd>{t(`admin:users.role.${user.role}`)}</dd>
        <dt>{t("admin:user.postCount")}</dt>
        <dd>{user.postCount}</dd>
        <dt>{t("admin:user.receivedReportCount")}</dt>
        <dd>{user.receivedReportCount}</dd>
        <dt>{t("admin:user.lastLoginAt")}</dt>
        <dd>{user.lastLoginAt ? format.dateTime(user.lastLoginAt) : t("admin:user.never")}</dd>
      </dl>

      <section aria-labelledby="admin-user-blogs">
        <h2 id="admin-user-blogs">{t("admin:user.blogs")}</h2>
        {user.blogs.length === 0 ? (
          <p>{t("admin:user.noBlogs")}</p>
        ) : (
          <ul>
            {user.blogs.map((blog) => (
              <li key={blog.handle}>
                {blog.status === "ACTIVE" ? (
                  <Link to={`/${blog.handle}`}>{blog.title}</Link>
                ) : (
                  <span>{blog.title}</span>
                )}{" "}
                @{blog.handle}
                {blog.status === "DELETED" && <> ({t("admin:report.state.DELETED")})</>}
              </li>
            ))}
          </ul>
        )}
        <Form method="post" className="blog-limit" key={`limit-${user.blogLimit.limit}`}>
          <fieldset>
            <legend>{t("admin:user.blogLimit.legend")}</legend>
            <input type="hidden" name="intent" value="blogLimit" />
            <p>
              {t("admin:user.blogLimit.current", {
                current: user.blogLimit.current,
                limit: user.blogLimit.limit,
              })}{" "}
              (
              {user.blogLimit.custom
                ? t("admin:user.blogLimit.custom")
                : t("admin:user.blogLimit.default")}
              )
            </p>
            <label>
              {t("admin:user.blogLimit.limit")}{" "}
              <input name="maxBlogs" type="number" min={0} defaultValue={user.blogLimit.limit} />
            </label>{" "}
            <button type="submit" disabled={submitting}>
              {t("admin:user.blogLimit.submit")}
            </button>{" "}
            {user.blogLimit.custom && (
              <button type="submit" name="reset" value="1" disabled={submitting}>
                {t("admin:user.blogLimit.reset")}
              </button>
            )}
          </fieldset>
        </Form>
      </section>

      <section aria-labelledby="admin-user-contents">
        <h2 id="admin-user-contents">{t("admin:user.contentLinks.title")}</h2>
        <ul>
          <li>
            <Link to={links.posts}>{t("admin:user.contentLinks.posts")}</Link>
          </li>
          <li>
            <Link to={links.comments}>{t("admin:user.contentLinks.comments")}</Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="admin-user-role">
        <h2 id="admin-user-role">{t("admin:user.roleArea.title")}</h2>
        <p>{t("admin:user.roleArea.current", { role: t(`admin:users.role.${user.role}`) })}</p>
        {canChangeRole ? (
          <RoleForm
            key={`role-${user.role}`}
            member={{ userId: user.id, nickname: user.nickname, role: user.role }}
            legend={t("admin:user.roleArea.legend")}
          />
        ) : (
          <p className="form-hint">{t("admin:user.roleArea.readOnly")}</p>
        )}
        <p>
          <Link to={links.auditLog}>{t("admin:user.roleArea.auditLog")}</Link>
        </p>
      </section>

      {user.status === "ACTIVE" && (
        <Form method="post" className="user-suspend" onSubmit={confirmSuspend}>
          <fieldset>
            <legend>{t("admin:user.suspend.legend")}</legend>
            <input type="hidden" name="intent" value="suspend" />
            <label>
              {t("admin:user.suspend.reason")}{" "}
              <input name="reason" required maxLength={SUSPEND_REASON_MAX} />
            </label>{" "}
            <button type="submit" disabled={submitting}>
              {t("admin:user.suspend.submit")}
            </button>
          </fieldset>
        </Form>
      )}
      {user.status === "SUSPENDED" && (
        <Form method="post" className="user-unsuspend">
          <fieldset>
            <legend>{t("admin:user.unsuspend.legend")}</legend>
            <input type="hidden" name="intent" value="unsuspend" />
            <label>
              {t("admin:user.unsuspend.reason")}{" "}
              <input name="reason" maxLength={SUSPEND_REASON_MAX} />
            </label>{" "}
            <button type="submit" disabled={submitting}>
              {t("admin:user.unsuspend.submit")}
            </button>
          </fieldset>
        </Form>
      )}
    </main>
  );
}
