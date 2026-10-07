import { useTranslation } from "react-i18next";
import { Form, Link, useActionData, useLoaderData } from "react-router";

import { adminNotFound, isAdminDenied, requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import { fieldErrorMessages } from "~/api/errorMessage";
import type {
  AdminExternalBlog,
  AdminExternalPost,
  ExternalPostStatus,
  TopicNode,
} from "~/api/models";
import { parsePage } from "~/blog/listing";
import { AdminExternalTabs } from "~/components/external/AdminExternalTabs";
import { ExternalBlogStatusBadge } from "~/components/external/ExternalBlogStatusBadge";
import { TopicSelect } from "~/components/external/TopicSelect";
import { FormAlert } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { externalActionError, formId, formText, invalidField } from "~/external/actions.server";
import { externalErrorMessage, fetchResultLabel, type ExternalFormError } from "~/external/status";
import { topicLabel } from "~/external/topics";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-blog";

export const ADMIN_EXTERNAL_POSTS_PAGE_SIZE = 20;
const POST_STATUSES: readonly ExternalPostStatus[] = ["ACTIVE", "REMOVED"];

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:manage.detail.title"), t("appName"));
}

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!value || !/^\d{1,18}$/.test(value) || !Number.isSafeInteger(id) || id <= 0) {
    throw adminNotFound();
  }
  return id;
}

export function postsHref(id: number, status: ExternalPostStatus | null, page = 1): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/external-blogs/${id}${query ? `?${query}` : ""}`;
}

/**
 * 외부 블로그 상세(`/admin/external-blogs/:id`, 007 T041): 등록 정보·수집 상태, 상태에 맞는 버튼(승인 대기면 승인·거절), 기본 주제 변경,
 * 수집된 글 표(상태 필터, 원문 링크, 주제·출처·신뢰도, 클릭 수, 포털 제외 여부). 일시 중지·차단·내림 등은 US4가 더한다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const id = parseId(params.id);
  const search = new URL(request.url).searchParams;
  const statusText = search.get("status");
  const status = (POST_STATUSES as readonly string[]).includes(statusText ?? "")
    ? (statusText as ExternalPostStatus)
    : null;
  const page = parsePage(search.get("page"));
  const api = createApiClient(request);
  const [blog, posts, topics] = await Promise.all([
    api.get<AdminExternalBlog>(`/admin/external-blogs/${id}`),
    api.send<AdminExternalPost[]>(`/admin/external-blogs/${id}/posts`, {
      query: {
        ...(status ? { status } : {}),
        page: page - 1,
        size: ADMIN_EXTERNAL_POSTS_PAGE_SIZE,
      },
    }),
    api.get<TopicNode[]>("/topics").catch(() => [] as TopicNode[]),
  ]).catch(throwAdminError);
  return {
    blog,
    status,
    page,
    posts: posts.result,
    totalCount: posts.totalCount ?? posts.result.length,
    topics,
  };
}

/** `intent=approve|reject|default-topic`. 성공하면 loader가 다시 읽는다. */
export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const id = parseId(params.id);
  const api = createApiClient(request);
  const form = await request.formData();
  const intent = formText(form, "intent");
  try {
    switch (intent) {
      case "approve":
        await api.post(`/admin/external-blogs/${id}/approve`);
        break;
      case "reject": {
        const reason = formText(form, "reason");
        if (!reason) {
          throw invalidField("reason", "REQUIRED");
        }
        await api.post(`/admin/external-blogs/${id}/reject`, { body: { reason } });
        break;
      }
      case "default-topic":
        await api.patch(`/admin/external-blogs/${id}`, {
          body: { defaultTopicId: formId(form, "defaultTopicId") },
        });
        break;
      default:
        throw invalidField("intent");
    }
    return { intent, ok: true as const };
  } catch (error) {
    if (isAdminDenied(error)) {
      throw adminNotFound();
    }
    return externalActionError(intent, error);
  }
}

export default function AdminExternalBlog() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { blog, status, page, posts, totalCount, topics } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const error = result && !result.ok ? (result.error as ExternalFormError) : null;
  const fields = error ? fieldErrorMessages(t, error.fieldErrors) : {};
  const message = error && Object.keys(fields).length === 0 ? externalErrorMessage(t, error) : null;
  const errorFor = (intent: string) => (result?.intent === intent ? message : null);
  const dateTime = (value: string | null) => (value ? format.dateTime(value) : "-");

  return (
    <main className="admin-external-blog">
      <AdminExternalTabs />
      <p>
        <Link to="/admin/external-blogs">{t("external:manage.detail.back")}</Link>
      </p>
      <h1>{blog.title ?? t("external:common.untitled")}</h1>
      <p>
        <ExternalBlogStatusBadge blog={blog} />
      </p>
      {result?.ok && <p role="status">{t("external:admin.detail.done")}</p>}

      <section>
        <h2>{t("external:admin.detail.registration")}</h2>
        <dl className="external-blog-info">
          <dt>{t("external:common.feedUrl")}</dt>
          <dd>
            <code>{blog.feedUrl}</code>
          </dd>
          {blog.siteUrl && (
            <>
              <dt>{t("external:common.siteUrl")}</dt>
              <dd>
                <a href={blog.siteUrl} target="_blank" rel="noopener nofollow noreferrer">
                  {blog.siteUrl}
                </a>
              </dd>
            </>
          )}
          <dt>{t("external:common.registrationType")}</dt>
          <dd>{t(`external:registrationType.${blog.registrationType}`)}</dd>
          {blog.registrationBasis && (
            <>
              <dt>{t("external:admin.detail.basis")}</dt>
              <dd>{blog.registrationBasis}</dd>
            </>
          )}
          <dt>{t("external:common.member")}</dt>
          <dd>
            {blog.member ? (
              <Link to={`/admin/users/${blog.member.userId}`}>{blog.member.nickname}</Link>
            ) : (
              "-"
            )}
          </dd>
          <dt>{t("external:common.verified")}</dt>
          <dd>
            {blog.ownershipVerified
              ? `${t("external:common.verified")} · ${dateTime(blog.ownershipVerifiedAt)}`
              : t("external:common.notVerified")}
          </dd>
          <dt>{t("external:admin.detail.reviewedBy")}</dt>
          <dd>
            {blog.reviewedBy ? `${blog.reviewedBy.nickname} · ${dateTime(blog.reviewedAt)}` : "-"}
          </dd>
          {blog.rejectReason && (
            <>
              <dt>{t("external:common.reason")}</dt>
              <dd>{blog.rejectReason}</dd>
            </>
          )}
        </dl>
      </section>

      <section>
        <h2>{t("external:admin.detail.fetch")}</h2>
        <dl className="external-blog-info">
          <dt>{t("external:admin.detail.nextFetch")}</dt>
          <dd>{dateTime(blog.nextFetchAt)}</dd>
          <dt>{t("external:common.lastFetch")}</dt>
          <dd>{dateTime(blog.lastFetchedAt)}</dd>
          <dt>{t("external:admin.detail.lastResult")}</dt>
          <dd>{fetchResultLabel(t, blog.lastFetchResult)}</dd>
          <dt>{t("external:admin.detail.httpStatus")}</dt>
          <dd>{blog.lastHttpStatus ?? "-"}</dd>
          <dt>{t("external:admin.detail.failures")}</dt>
          <dd>{blog.consecutiveFailures}</dd>
          <dt>{t("external:admin.detail.firstFailed")}</dt>
          <dd>{dateTime(blog.firstFailedAt)}</dd>
        </dl>
      </section>

      {blog.status === "PENDING" && (
        <section className="external-admin-actions">
          <Form method="post">
            <input type="hidden" name="intent" value="approve" />
            <FormAlert message={errorFor("approve")} />
            <button type="submit">{t("external:admin.detail.approve")}</button>
          </Form>
          <Form method="post">
            <input type="hidden" name="intent" value="reject" />
            <label htmlFor="reject-reason">{t("external:common.reason")}</label>
            <textarea id="reject-reason" name="reason" required maxLength={500} />
            {result?.intent === "reject" && fields.reason && (
              <p className="field-error" role="alert">
                {fields.reason}
              </p>
            )}
            <FormAlert message={errorFor("reject")} />
            <button type="submit">{t("external:admin.detail.reject")}</button>
          </Form>
        </section>
      )}

      {blog.status !== "REJECTED" && blog.status !== "RELEASED" && (
        <Form method="post" className="external-default-topic" key={blog.defaultTopicId}>
          <input type="hidden" name="intent" value="default-topic" />
          <TopicSelect
            topics={topics}
            defaultValue={blog.defaultTopicId}
            hint={t("external:manage.detail.defaultTopicHint")}
            error={result?.intent === "default-topic" ? (fields.defaultTopicId ?? null) : null}
          />
          <FormAlert message={errorFor("default-topic")} />
          <button type="submit">{t("external:common.change")}</button>
        </Form>
      )}

      <section className="external-posts">
        <h2>{t("external:admin.detail.posts")}</h2>
        <nav className="status-tabs" aria-label={t("external:common.status")}>
          <ul>
            {[null, ...POST_STATUSES].map((value) => (
              <li key={value ?? "ALL"}>
                <Link
                  to={postsHref(blog.id, value)}
                  aria-current={value === status ? "page" : undefined}
                >
                  {value ? t(`external:postStatus.${value}`) : t("external:status.ALL")}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {posts.length === 0 ? (
          <p>{t("external:manage.detail.noPosts")}</p>
        ) : (
          <table className="admin-table" aria-label={t("external:admin.detail.posts")}>
            <thead>
              <tr>
                <th>{t("external:common.title")}</th>
                <th>{t("external:common.publishedAt")}</th>
                <th>{t("external:common.topic")}</th>
                <th>{t("external:admin.detail.confidence")}</th>
                <th>{t("external:common.status")}</th>
                <th>{t("external:common.clicks")}</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id}>
                  <td>
                    <a
                      href={post.link}
                      target="_blank"
                      rel="noopener nofollow noreferrer"
                      title={t("external:common.newTab")}
                    >
                      {post.title}
                    </a>
                  </td>
                  <td>{dateTime(post.publishedAt)}</td>
                  <td>
                    {topicLabel(topics, post.topicId, i18n.language)} (
                    {t(`external:topicSource.${post.topicSource}`)})
                  </td>
                  <td>
                    {post.classifierConfidence === null
                      ? "-"
                      : format.number(Math.round(post.classifierConfidence * 100) / 100)}
                  </td>
                  <td>
                    {t(`external:postStatus.${post.status}`)}
                    {post.removedReason &&
                      ` · ${t(`external:removedReason.${post.removedReason}`)}`}
                    {post.excluded && (
                      <p className="field-hint">
                        {t("external:admin.detail.excluded", { reason: post.excluded.reason })}
                      </p>
                    )}
                  </td>
                  <td>{format.number(post.clickCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          page={page}
          totalCount={totalCount}
          pageSize={ADMIN_EXTERNAL_POSTS_PAGE_SIZE}
          hrefFor={(target) => postsHref(blog.id, status, target)}
        />
      </section>
    </main>
  );
}
