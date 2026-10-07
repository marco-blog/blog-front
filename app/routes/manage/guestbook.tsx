import { useTranslation } from "react-i18next";
import { Link, useActionData, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import type { Blog, GuestbookEntry } from "~/api/models";
import { parsePage, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import type { GuestbookActionData } from "~/components/guestbook/actions";
import { runGuestbookAction } from "~/components/guestbook/actions.server";
import { GuestbookList } from "~/components/guestbook/GuestbookList";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/guestbook";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:guestbook.title"), t("appName"));
}

/**
 * 방명록 관리(`/:handle/manage/guestbook`, SSR, 004 FR-057·058): 주인은 비밀글을 포함한 모든 글을 보고 답글을 달거나 지운다.
 * 방명록이 꺼져 있어도 주인은 볼 수 있고, 켜는 곳(블로그 설정)을 안내한다. 회원 차단은 004 US5가 더한다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { user, handle } = await requireOwnedBlog(request, params.handle);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, entries] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<GuestbookEntry[]>(`/blogs/${handle}/guestbook`, { query: { page: page - 1 } }),
  ]).catch(throwManageError);
  return {
    handle,
    viewerId: user.userId,
    guestbookEnabled: blog.guestbookEnabled ?? true,
    entries: entries.result,
    totalCount: entries.totalCount ?? entries.result.length,
    page,
  };
}

/** 답글·지우기(`intent=reply|delete`). 성공하면 같은 쪽으로 리다이렉트한다. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  return runGuestbookAction(request, {
    handle,
    intents: ["reply", "delete", "update"],
    returnTo: withPage(`/${handle}/manage/guestbook`, page),
  });
}

export default function ManageGuestbook() {
  const { t } = useTranslation();
  const { handle, viewerId, guestbookEnabled, entries, totalCount, page } =
    useLoaderData<typeof loader>();
  const result = useActionData<GuestbookActionData>();

  return (
    <main className="manage-guestbook">
      <h1>{t("manage:guestbook.title")}</h1>
      {!guestbookEnabled && (
        <p role="note">
          {t("manage:guestbook.disabled")}{" "}
          <Link to={`/${handle}/manage/settings`}>{t("manage:guestbook.settingsLink")}</Link>
        </p>
      )}
      <p>
        <Link to={`/${handle}/guestbook`}>{t("manage:guestbook.viewPublic")}</Link>
      </p>
      <GuestbookList entries={entries} viewerId={viewerId} isOwner result={result} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={POST_PAGE_SIZE}
        hrefFor={(target) => withPage(`/${handle}/manage/guestbook`, target)}
      />
    </main>
  );
}
