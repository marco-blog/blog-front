import { useTranslation } from "react-i18next";
import { Form, Link, useActionData, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import type { MyExternalBlog, MyExternalPost, TopicNode, Verification } from "~/api/models";
import { parsePage, withPage } from "~/blog/listing";
import { ExternalBlogStatusBadge } from "~/components/external/ExternalBlogStatusBadge";
import { ExternalPostTable } from "~/components/external/ExternalPostTable";
import { ReleaseForm } from "~/components/external/ReleaseForm";
import { TopicSelect } from "~/components/external/TopicSelect";
import { VerificationPanel } from "~/components/external/VerificationPanel";
import { FormAlert } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { externalActionError, formId, formText, invalidField } from "~/external/actions.server";
import { externalErrorMessage, fetchResultLabel, type ExternalFormError } from "~/external/status";
import { topicLabel } from "~/external/topics";
import { verificationFromForm } from "~/external/verification";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { manageNotFound, requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-blog";

/** 수집된 글 한 페이지(backend 기본값과 같다) */
export const EXTERNAL_POSTS_PAGE_SIZE = 20;

/** 소유 인증을 더 할 수 없는 상태(거절·차단·해제) */
const NO_VERIFY = new Set(["REJECTED", "BLOCKED", "RELEASED"]);

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:manage.detail.title"), t("appName"));
}

function parseId(value: string | undefined): number {
  const id = Number(value);
  if (!value || !/^\d{1,18}$/.test(value) || !Number.isSafeInteger(id) || id <= 0) {
    throw manageNotFound();
  }
  return id;
}

/**
 * 내 외부 블로그 상세(`/:handle/manage/external-blogs/:id`, 007 T040·T070): 상태와 안내, 소유 인증(미인증이면 코드 발급·확인),
 * 수집된 글 표. 인증된 주인은 기본 주제와 글마다 주제를 바꾼다(해제된 등록은 못 바꿈). 남의 등록이면 backend 404를 그대로 404로.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const id = parseId(params.id);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, posts, topics] = await Promise.all([
    api.get<MyExternalBlog>(`/me/external-blogs/${id}`),
    api.send<MyExternalPost[]>(`/me/external-blogs/${id}/posts`, {
      query: { page: page - 1, size: EXTERNAL_POSTS_PAGE_SIZE },
    }),
    api.get<TopicNode[]>("/topics").catch(() => [] as TopicNode[]),
  ]).catch(throwManageError);
  return {
    handle,
    blog,
    page,
    posts: posts.result,
    totalCount: posts.totalCount ?? posts.result.length,
    topics,
  };
}

/**
 * `intent=issue-code|check|default-topic|post-topic|release`. 해제는 `deletePosts`(`true`·`false`) 필수(결정 표 24번).
 * 확인에 성공하면 같은 요청에서 넘겨받기(`POST /external-blogs/{id}/claim`)로
 * 이 등록에 인증을 붙인다(내 등록이면 한도를 세지 않는다). 주제 변경은 인증된 주인만(아니면 backend 403).
 */
export async function action({ request, params }: Route.ActionArgs) {
  await requireOwnedBlog(request, params.handle);
  const id = parseId(params.id);
  const api = createApiClient(request);
  const form = await request.formData();
  const intent = formText(form, "intent");
  const feedUrl = formText(form, "feedUrl");
  switch (intent) {
    case "issue-code":
      try {
        const verification = await api.post<Verification>("/me/external-blog-verifications", {
          body: { feedUrl },
        });
        return { intent, ok: true as const, verification };
      } catch (error) {
        return externalActionError(intent, error, { verification: null });
      }
    case "check": {
      const verificationId = formId(form, "verificationId");
      try {
        if (verificationId === null) {
          throw invalidField("verificationId");
        }
        const verification = await api.post<Verification>(
          `/me/external-blog-verifications/${verificationId}/check`,
          { body: { feedUrl } },
        );
        await api.post<MyExternalBlog>(`/external-blogs/${id}/claim`, { body: { verificationId } });
        return { intent, ok: true as const, verification };
      } catch (error) {
        return externalActionError(intent, error, { verification: verificationFromForm(form) });
      }
    }
    case "default-topic":
      try {
        const defaultTopicId = formId(form, "defaultTopicId");
        if (defaultTopicId === null) {
          throw invalidField("defaultTopicId", "REQUIRED");
        }
        await api.patch<MyExternalBlog>(`/me/external-blogs/${id}`, { body: { defaultTopicId } });
        return { intent, ok: true as const, verification: null };
      } catch (error) {
        return externalActionError(intent, error, { verification: null });
      }
    case "post-topic": {
      const postId = formId(form, "postId");
      try {
        const topicId = formId(form, "topicId");
        if (postId === null) {
          throw invalidField("postId");
        }
        if (topicId === null) {
          throw invalidField("topicId", "REQUIRED");
        }
        await api.put<MyExternalPost>(`/me/external-blogs/${id}/posts/${postId}/topic`, {
          body: { topicId },
        });
        return { intent, ok: true as const, verification: null, postId };
      } catch (error) {
        return externalActionError(intent, error, { verification: null, postId });
      }
    }
    case "release": {
      const choice = formText(form, "deletePosts");
      try {
        if (choice !== "true" && choice !== "false") {
          throw invalidField("deletePosts", "REQUIRED");
        }
        await api.post<MyExternalBlog>(`/me/external-blogs/${id}/release`, {
          body: { deletePosts: choice === "true" },
        });
        return { intent, ok: true as const, verification: null };
      } catch (error) {
        return externalActionError(intent, error, { verification: null });
      }
    }
    default:
      return externalActionError(intent, invalidField("intent"), { verification: null });
  }
}

export default function ManageExternalBlog() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { handle, blog, page, posts, totalCount, topics } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const error = result && !result.ok ? (result.error as ExternalFormError) : null;
  const message = error ? externalErrorMessage(t, error) : null;
  const verification = (result?.verification ?? null) as Verification | null;
  const base = `/${handle}/manage/external-blogs`;
  const detailPath = `${base}/${blog.id}`;
  const editable = blog.ownershipVerified && blog.status !== "RELEASED";
  const topicIntent = result?.intent === "default-topic" || result?.intent === "post-topic";
  const releaseIntent = result?.intent === "release";
  const choiceMissing = Boolean(
    releaseIntent && error?.fieldErrors?.some((field) => field.field === "deletePosts"),
  );
  const title = blog.title ?? t("external:common.untitled");
  const guide =
    blog.status === "RELEASED"
      ? blog.postCount > 0
        ? t("external:manage.detail.releasedKept", { count: blog.postCount })
        : t("external:manage.detail.releasedNone")
      : t(`external:manage.detail.guide${blog.status}`, {
          reason: blog.rejectReason ?? "",
          result: fetchResultLabel(t, blog.lastFetchResult),
        });

  return (
    <main className="manage-external-blog">
      <p>
        <Link to={base}>{t("external:manage.detail.back")}</Link>
      </p>
      <h1>{title}</h1>
      <p>
        <ExternalBlogStatusBadge blog={blog} />
      </p>
      <p role="status">{guide}</p>
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
        <dt>{t("external:common.defaultTopic")}</dt>
        <dd>{topicLabel(topics, blog.defaultTopicId, i18n.language)}</dd>
        <dt>{t("external:common.lastFetch")}</dt>
        <dd>
          {blog.lastFetchedAt
            ? `${format.dateTime(blog.lastFetchedAt)} · ${fetchResultLabel(t, blog.lastFetchResult)}`
            : t("external:common.never")}
        </dd>
        <dt>{t("external:common.verified")}</dt>
        <dd>
          {blog.ownershipVerified
            ? t("external:common.verified")
            : t("external:common.notVerified")}
        </dd>
      </dl>

      {!blog.ownershipVerified && !NO_VERIFY.has(blog.status) && (
        <section className="external-verify-section">
          <h2>{t("external:manage.detail.verifyTitle")}</h2>
          <p>{t("external:manage.detail.verifyBenefit")}</p>
          {result?.intent === "issue-code" && <FormAlert message={message} />}
          <VerificationPanel
            verification={verification}
            feedUrl={blog.feedUrl}
            error={result?.intent === "check" ? message : null}
          />
        </section>
      )}

      {editable ? (
        <section className="external-topic-section">
          <h2>{t("external:common.defaultTopic")}</h2>
          <Form method="post" action={detailPath}>
            <input type="hidden" name="intent" value="default-topic" />
            <TopicSelect
              topics={topics}
              defaultValue={blog.defaultTopicId}
              hint={t("external:manage.detail.defaultTopicHint")}
            />
            <button type="submit">{t("external:common.save")}</button>
          </Form>
        </section>
      ) : (
        blog.status !== "RELEASED" && (
          <p className="field-hint">{t("external:manage.detail.verifyToEdit")}</p>
        )
      )}
      {topicIntent &&
        (result?.ok ? (
          <p role="status">{t("external:common.saved")}</p>
        ) : (
          <FormAlert message={message} />
        ))}

      {releaseIntent && result?.ok && <p role="status">{t("external:manage.detail.released")}</p>}
      <ReleaseForm
        blog={blog}
        action={detailPath}
        choiceError={choiceMissing ? t("external:manage.detail.choose") : null}
        error={releaseIntent && !choiceMissing ? message : null}
      />

      <section className="external-posts">
        <h2>{t("external:manage.detail.posts")}</h2>
        {posts.length === 0 ? (
          <p>{t("external:manage.detail.noPosts")}</p>
        ) : (
          <ExternalPostTable
            posts={posts}
            topics={topics}
            editable={editable}
            action={detailPath}
          />
        )}
        <Pagination
          page={page}
          totalCount={totalCount}
          pageSize={EXTERNAL_POSTS_PAGE_SIZE}
          hrefFor={(target) => withPage(detailPath, target)}
        />
      </section>
    </main>
  );
}
