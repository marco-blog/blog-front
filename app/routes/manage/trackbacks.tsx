import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import { isApiError } from "~/api/errors";
import { VALIDATION_FAILED, toFormError, type FormErrorData } from "~/api/formErrors";
import type { Blog, ManagedTrackback } from "~/api/models";
import { loginPath } from "~/auth/paths";
import { parsePostId } from "~/blog/ids";
import { parsePage } from "~/blog/listing";
import { FormAlert } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { isWebUrl } from "~/components/trackback/TrackbackList";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/trackbacks";

/** 한 쪽 트랙백 수(backend 기본값과 같다) */
export const MANAGE_TRACKBACKS_PAGE_SIZE = 20;

export type TrackbackActionData =
  { intent: "delete"; ok: true } | (FormErrorData & { intent: string; ok: false });

export function manageTrackbacksHref(handle: string, page = 1): string {
  const path = `/${handle}/manage/trackbacks`;
  return page > 1 ? `${path}?page=${page}` : path;
}

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("trackback:manage.title"), t("appName"));
}

/**
 * 받은 트랙백(`/:handle/manage/trackbacks?page=`, 005 T104, FR-053): 내 블로그 글들이 받은 트랙백(관리자가 숨긴 것은
 * "숨김" 표시, 삭제 불가)과 위쪽 "트랙백 받기" 상태·설정 링크.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, trackbacks] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<ManagedTrackback[]>(`/blogs/${handle}/manage/trackbacks`, {
      query: { page: page - 1, size: MANAGE_TRACKBACKS_PAGE_SIZE },
    }),
  ]).catch(throwManageError);
  return {
    handle,
    page,
    trackbackEnabled: blog.trackbackEnabled !== false,
    trackbacks: trackbacks.result,
    totalCount: trackbacks.totalCount ?? trackbacks.result.length,
  };
}

/** `intent=delete` → `DELETE /trackbacks/{id}`(주인). 끝나면 loader가 목록을 다시 읽는다. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = parsePostId(String(form.get("id") ?? ""));
  if (intent !== "delete" || id === null) {
    return data<TrackbackActionData>(
      { intent, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: [] },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).delete(`/trackbacks/${id}`);
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      throw redirect(loginPath(manageTrackbacksHref(handle)));
    }
    const { data: formError, status } = toFormError(error);
    return data<TrackbackActionData>({ ...formError, intent, ok: false }, { status });
  }
  return data<TrackbackActionData>({ intent: "delete", ok: true });
}

export default function ManageTrackbacks() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { handle, page, trackbackEnabled, trackbacks, totalCount } = useLoaderData<typeof loader>();
  const result = useActionData<TrackbackActionData>();
  const submitting = useNavigation().state === "submitting";
  const confirmDelete = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(t("trackback:manage.deleteConfirm"))) {
      event.preventDefault();
    }
  };

  return (
    <main className="manage-trackbacks">
      <h1>{t("trackback:manage.title")}</h1>
      <p className="trackback-receiving">
        {t(trackbackEnabled ? "trackback:manage.receivingOn" : "trackback:manage.receivingOff")}{" "}
        <Link to={`/${handle}/manage/settings`}>{t("trackback:manage.settingsLink")}</Link>
      </p>
      {result?.ok && <p role="status">{t("trackback:manage.deleted")}</p>}
      <FormAlert message={result && !result.ok ? errorMessage(t, result) : null} />
      {trackbacks.length === 0 ? (
        <p>{t("trackback:manage.empty")}</p>
      ) : (
        <ul className="manage-trackback-list" aria-label={t("trackback:manage.list")}>
          {trackbacks.map((trackback) => (
            <li key={trackback.id}>
              <p className="trackback-title">
                {isWebUrl(trackback.url) ? (
                  <a href={trackback.url} rel="nofollow ugc noopener">
                    {trackback.title}
                  </a>
                ) : (
                  <span>{trackback.title}</span>
                )}
                {trackback.hidden && (
                  <>
                    {" "}
                    <span className="badge">{t("trackback:manage.hidden")}</span>
                  </>
                )}
              </p>
              {trackback.excerpt && <p className="trackback-excerpt">{trackback.excerpt}</p>}
              <p className="trackback-meta">
                {trackback.blogName && <span>{trackback.blogName}</span>}{" "}
                <span>{trackback.url}</span> ·{" "}
                <Link to={`/${handle}/${trackback.post.id}#trackback-${trackback.id}`}>
                  {t("trackback:manage.on", { title: trackback.post.title })}
                </Link>{" "}
                <time dateTime={trackback.receivedAt}>{format.dateTime(trackback.receivedAt)}</time>
              </p>
              {trackback.hidden ? (
                <p className="form-hint">{t("trackback:manage.hiddenHint")}</p>
              ) : (
                <Form method="post" onSubmit={confirmDelete}>
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={trackback.id} />
                  <button
                    type="submit"
                    disabled={submitting}
                    aria-label={t("trackback:manage.deleteLabel", { title: trackback.title })}
                  >
                    {t("trackback:manage.delete")}
                  </button>
                </Form>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={MANAGE_TRACKBACKS_PAGE_SIZE}
        hrefFor={(target) => manageTrackbacksHref(handle, target)}
      />
    </main>
  );
}
