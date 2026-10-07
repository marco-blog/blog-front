import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { createApiClient } from "~/api/client.server";
import type { ReportTargetPreview as Preview } from "~/api/models";
import { parsePostId } from "~/blog/ids";
import { parsePage, withPage } from "~/blog/listing";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { ReportTargetPreview } from "~/components/admin/ReportTargetPreview";
import { Pagination } from "~/components/Pagination";
import { metaT } from "~/i18n/meta";
import { hiddenContentPath } from "~/moderation/reportTarget";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/hidden-posts";

export const HIDDEN_PAGE_SIZE = 20;
const PATH = "/admin/contents/hidden-posts";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:hiddenPosts.title"), t("appName"));
}

/** 숨긴 글(`/admin/contents/hidden-posts`, 005 T061): 숨긴 순서 최신, "숨김 해제" */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const response = await createApiClient(request)
    .send<Preview[]>("/admin/contents/hidden-posts", {
      query: { page: page - 1, size: HIDDEN_PAGE_SIZE },
    })
    .catch(throwAdminError);
  return {
    page,
    posts: response.result,
    totalCount: response.totalCount ?? response.result.length,
  };
}

/** `intent=unhide` + `postId` → DELETE /admin/contents/posts/{id}/hidden */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const postId = parsePostId(String(form.get("postId") ?? ""));
  if (intent !== "unhide" || postId === null) {
    return adminInvalid(intent);
  }
  try {
    await createApiClient(request).delete(hiddenContentPath("POST", postId));
  } catch (error) {
    return adminActionError(intent, error);
  }
  return data<AdminActionData>({ intent, ok: true });
}

export default function AdminHiddenPosts() {
  const { t } = useTranslation();
  const { page, posts, totalCount } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";
  return (
    <main className="admin-hidden-posts">
      <h1>{t("admin:hiddenPosts.title")}</h1>
      {result?.ok && <p role="status">{t("admin:hiddenPosts.done")}</p>}
      <AdminFormErrors error={result && !result.ok ? result : null} />
      {posts.length === 0 ? (
        <p>{t("admin:hiddenPosts.empty")}</p>
      ) : (
        <ul className="admin-hidden-list" aria-label={t("admin:hiddenPosts.list")}>
          {posts.map((post) => (
            <li key={post.id}>
              <section aria-label={post.title ?? String(post.id)}>
                <ReportTargetPreview target={post} />
                <Form method="post">
                  <input type="hidden" name="intent" value="unhide" />
                  <input type="hidden" name="postId" value={post.id} />
                  <button type="submit" disabled={submitting}>
                    {t("admin:hiddenPosts.unhide")}
                  </button>
                </Form>
              </section>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={HIDDEN_PAGE_SIZE}
        hrefFor={(number) => withPage(PATH, number)}
      />
    </main>
  );
}
