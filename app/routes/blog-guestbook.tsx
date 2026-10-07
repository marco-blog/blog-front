import { useTranslation } from "react-i18next";
import { data, useActionData, useLoaderData, useRouteLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, GuestbookEntry } from "~/api/models";
import { loginPath } from "~/auth/paths";
import { writerMode } from "~/blog/guestAuthor";
import { isValidHandle } from "~/blog/ids";
import { parsePage, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import type { GuestbookActionData } from "~/components/guestbook/actions";
import { runGuestbookAction } from "~/components/guestbook/actions.server";
import { GuestbookForm } from "~/components/guestbook/GuestbookForm";
import { GuestbookList } from "~/components/guestbook/GuestbookList";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import type { RootData } from "~/root";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-guestbook";

/** 한 쪽의 최상위 글 수(004 FR-056) */
export const PAGE_SIZE = POST_PAGE_SIZE;

export function guestbookHref(handle: string, page = 1): string {
  return withPage(`/${handle}/guestbook`, page);
}

/**
 * 방명록(`/:handle/guestbook?page=`, SSR, 004 FR-056~058·066). 최상위 글 최신순 20개와 각 글의 주인 답글.
 * 방명록을 끈 블로그는 주인 외에 404(`GUESTBOOK_DISABLED`).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, entries] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<GuestbookEntry[]>(`/blogs/${handle}/guestbook`, { query: { page: page - 1 } }),
  ]).catch(throwApiErrorResponse);
  return {
    blog: {
      handle: blog.handle,
      title: blog.title,
      description: blog.description,
      guestWriteEnabled: blog.guestWriteEnabled ?? false,
    },
    entries: entries.result,
    totalCount: entries.totalCount ?? entries.result.length,
    page,
    pageSize: PAGE_SIZE,
    origin: publicOrigin(request),
  };
}

/** `intent=create|reply|update|delete|unlock`. 성공하면 같은 쪽으로(새 글은 첫 쪽으로) 리다이렉트한다. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  return runGuestbookAction(request, {
    handle,
    returnTo: guestbookHref(handle, page),
    createdTo: guestbookHref(handle),
  });
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const { blog, page, origin } = loaderData;
  return pageMeta({
    title: `${t("guestbook:title")} - ${blog.title}`,
    url: absoluteUrl(origin, guestbookHref(blog.handle, page)),
    siteName: t("appName"),
    noindex: page > 1,
  });
}

export default function BlogGuestbook() {
  const { t } = useTranslation();
  const { blog, entries, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  const result = useActionData<GuestbookActionData>();
  const viewer = useRouteLoaderData<RootData>("root")?.user ?? null;
  const isOwner = viewer?.blogs?.includes(blog.handle) ?? false;
  const mode = writerMode(viewer, blog.guestWriteEnabled);

  return (
    <main className="blog-guestbook">
      <h1>{t("guestbook:title")}</h1>
      <GuestbookForm
        key={`${totalCount}-${entries[0]?.id ?? 0}`}
        mode={mode}
        loginHref={loginPath(guestbookHref(blog.handle, page))}
        result={result}
      />
      <GuestbookList
        entries={entries}
        viewerId={viewer?.userId ?? null}
        isOwner={isOwner}
        result={result}
      />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => guestbookHref(blog.handle, target)}
      />
    </main>
  );
}
