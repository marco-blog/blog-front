import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import { toFormError, useFormMessages, type FormErrorData } from "~/api/formErrors";
import type { Blog, CategoryNode, FeedContentMode } from "~/api/models";
import { FormAlert } from "~/components/form/FormField";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/feed";

/** backend가 받는 피드 글 수(002 FR-046, contracts/api.md) */
export const FEED_ITEM_COUNTS = [10, 20, 30, 50] as const;
export const FEED_CONTENT_MODES: readonly FeedContentMode[] = ["FULL", "SUMMARY"];

type FeedActionData = { ok: true } | (FormErrorData & { ok: false });

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:feed.title"), t("appName"));
}

function flatten(categories: CategoryNode[]): { id: number; name: string }[] {
  return categories.flatMap((category) => [
    { id: category.id, name: category.name },
    ...flatten(category.children),
  ]);
}

/**
 * 피드 설정(`/:handle/manage/feed`, SSR, 002 FR-046): 피드에 담을 글 수(10·20·30·50)와 전문·요약,
 * 이 블로그의 RSS·Atom·카테고리 RSS 주소 안내.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const blog = await createApiClient(request).get<Blog>(`/blogs/${handle}`).catch(throwManageError);
  const origin = publicOrigin(request);
  return {
    handle,
    feedItemCount: blog.feedItemCount,
    feedContentMode: blog.feedContentMode,
    rssUrl: new URL(`/${handle}/rss`, origin).toString(),
    atomUrl: new URL(`/${handle}/atom`, origin).toString(),
    categoryFeeds: flatten(blog.categories).map((category) => ({
      ...category,
      url: new URL(`/${handle}/category/${category.id}/rss`, origin).toString(),
    })),
  };
}

/** `PATCH /blogs/{handle}` `{ feedItemCount, feedContentMode }`. 허용 값 검사는 backend가 한다(`INVALID`). */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  const count = Number(form.get("feedItemCount"));
  try {
    await createApiClient(request).patch(`/blogs/${handle}`, {
      body: {
        feedItemCount: Number.isInteger(count) ? count : null,
        feedContentMode: String(form.get("feedContentMode") ?? "") || null,
      },
    });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<FeedActionData>({ ...formError, ok: false }, { status });
  }
  return data<FeedActionData>({ ok: true });
}

export default function ManageFeed() {
  const { t } = useTranslation();
  const { feedItemCount, feedContentMode, rssUrl, atomUrl, categoryFeeds } =
    useLoaderData<typeof loader>();
  const result = useActionData<FeedActionData>();
  const messages = useFormMessages(result && !result.ok ? result : null);
  const submitting = useNavigation().state === "submitting";

  return (
    <main className="manage-feed">
      <h1>{t("manage:feed.title")}</h1>
      {result?.ok && <p role="status">{t("manage:feed.saved")}</p>}
      <Form method="post" key={`${feedItemCount}|${feedContentMode}`}>
        <FormAlert message={messages.form} />
        <div className="form-field">
          <label htmlFor="feed-item-count">{t("manage:feed.itemCount")}</label>
          <select
            id="feed-item-count"
            name="feedItemCount"
            defaultValue={feedItemCount}
            aria-invalid={messages.fields.feedItemCount ? true : undefined}
          >
            {FEED_ITEM_COUNTS.map((count) => (
              <option key={count} value={count}>
                {t("manage:feed.itemCountOption", { count })}
              </option>
            ))}
          </select>
          {messages.fields.feedItemCount && (
            <p className="form-error">{messages.fields.feedItemCount}</p>
          )}
        </div>
        <fieldset className="form-field">
          <legend>{t("manage:feed.contentMode")}</legend>
          {FEED_CONTENT_MODES.map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                name="feedContentMode"
                value={mode}
                defaultChecked={mode === feedContentMode}
              />{" "}
              {t(mode === "FULL" ? "manage:feed.full" : "manage:feed.summary")}
            </label>
          ))}
          <p className="form-hint">{t("manage:feed.contentHint")}</p>
          {messages.fields.feedContentMode && (
            <p className="form-error">{messages.fields.feedContentMode}</p>
          )}
        </fieldset>
        <button type="submit" disabled={submitting}>
          {t("manage:feed.submit")}
        </button>
      </Form>
      <section aria-labelledby="feed-urls">
        <h2 id="feed-urls">{t("manage:feed.urls")}</h2>
        <dl>
          <dt>{t("manage:feed.rss")}</dt>
          <dd>
            <a href={rssUrl}>{rssUrl}</a>
          </dd>
          <dt>{t("manage:feed.atom")}</dt>
          <dd>
            <a href={atomUrl}>{atomUrl}</a>
          </dd>
        </dl>
        {categoryFeeds.length > 0 && (
          <>
            <h3>{t("manage:feed.categoryRss")}</h3>
            <p className="form-hint">{t("manage:feed.categoryHint")}</p>
            <ul>
              {categoryFeeds.map((category) => (
                <li key={category.id}>
                  {category.name}: <a href={category.url}>{category.url}</a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
