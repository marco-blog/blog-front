import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import type { ManageDashboard } from "~/api/models";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { postHref } from "~/manage/links";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/dashboard";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:dashboard.title"), t("appName"));
}

/**
 * 블로그 관리 대시보드(`/:handle/manage`, SSR, 006 FR-100의 001 범위): 임시저장 글 수, 최근 7일 새 댓글 수, 최근 글·댓글 5건.
 * 004가 최근 7일 새 방명록 수와 최근 방명록 5건을 더했다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const dashboard = await createApiClient(request)
    .get<ManageDashboard>(`/blogs/${handle}/manage/dashboard`)
    .catch(throwManageError);
  return { handle, dashboard };
}

export default function ManageDashboardPage() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { handle, dashboard } = useLoaderData<typeof loader>();

  return (
    <main className="manage-dashboard">
      <h1>{t("manage:dashboard.title")}</h1>
      <dl className="manage-stats">
        <div>
          <dt>{t("manage:dashboard.drafts")}</dt>
          <dd>
            <Link to={`/${handle}/manage/posts?status=DRAFT`}>
              {t("manage:dashboard.draftCount", { drafts: dashboard.draftCount })}
            </Link>
          </dd>
        </div>
        <div>
          <dt>{t("manage:dashboard.newComments")}</dt>
          <dd>{t("manage:dashboard.commentCount", { comments: dashboard.newComments7d })}</dd>
        </div>
        {dashboard.newGuestbook7d !== undefined && (
          <div>
            <dt>{t("manage:dashboard.newGuestbook")}</dt>
            <dd>
              <Link to={`/${handle}/manage/guestbook`}>
                {t("manage:dashboard.guestbookCount", { count: dashboard.newGuestbook7d })}
              </Link>
            </dd>
          </div>
        )}
      </dl>

      <section aria-labelledby="recent-posts">
        <h2 id="recent-posts">{t("manage:dashboard.recentPosts")}</h2>
        {dashboard.recentPosts.length === 0 ? (
          <p>{t("manage:dashboard.noPosts")}</p>
        ) : (
          <ul>
            {dashboard.recentPosts.map((post) => (
              <li key={post.id}>
                <Link to={postHref(handle, post)}>{post.title || t("manage:posts.untitled")}</Link>{" "}
                <span>{t(`manage:status.${post.status}`)}</span>{" "}
                <span>{t(`manage:visibility.${post.visibility}`)}</span>{" "}
                <time dateTime={post.updatedAt}>{format.date(post.updatedAt)}</time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-comments">
        <h2 id="recent-comments">{t("manage:dashboard.recentComments")}</h2>
        {dashboard.recentComments.length === 0 ? (
          <p>{t("manage:dashboard.noComments")}</p>
        ) : (
          <ul>
            {dashboard.recentComments.map((comment) => (
              <li key={comment.id}>
                <p className="comment-content" style={{ whiteSpace: "pre-wrap" }}>
                  {comment.deleted ? t("manage:dashboard.deletedComment") : comment.content}
                </p>
                <p>
                  {comment.author?.nickname ?? t("comment:unknownAuthor")} ·{" "}
                  <Link to={`/${handle}/${comment.postId}#comment-${comment.id}`}>
                    {t("manage:dashboard.commentOn", { title: comment.postTitle })}
                  </Link>{" "}
                  <time dateTime={comment.createdAt}>{format.dateTime(comment.createdAt)}</time>
                </p>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link to={`/${handle}/manage/comments`}>{t("manage:dashboard.allComments")}</Link>
        </p>
      </section>

      {dashboard.recentGuestbook && (
        <section aria-labelledby="recent-guestbook">
          <h2 id="recent-guestbook">{t("manage:dashboard.recentGuestbook")}</h2>
          {dashboard.recentGuestbook.length === 0 ? (
            <p>{t("manage:dashboard.noGuestbook")}</p>
          ) : (
            <ul>
              {dashboard.recentGuestbook.map((entry) => (
                <li key={entry.id}>
                  <p className="guestbook-content" style={{ whiteSpace: "pre-wrap" }}>
                    {entry.deleted ? t("guestbook:entry.deleted") : entry.content}
                  </p>
                  <p>
                    {entry.author?.nickname ?? t("guestbook:entry.unknownAuthor")}
                    {entry.author?.guest && <> ({t("guestbook:entry.guest")})</>}
                    {entry.secret && <> · {t("guestbook:entry.secret")}</>} ·{" "}
                    <time dateTime={entry.createdAt}>{format.dateTime(entry.createdAt)}</time>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link to={`/${handle}/manage/guestbook`}>{t("manage:dashboard.allGuestbook")}</Link>
          </p>
        </section>
      )}
    </main>
  );
}
