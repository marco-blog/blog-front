import { useTranslation } from "react-i18next";
import { Link, useActionData, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import type { ManageComment } from "~/api/models";
import type { CommentActionData } from "~/components/comment/actions";
import { runCommentAction } from "~/components/comment/actions.server";
import { DeleteCommentButton } from "~/components/comment/CommentSection";
import { FormAlert } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/comments";

/** 한 페이지 댓글 수(backend 기본값과 같다) */
export const MANAGE_COMMENTS_PAGE_SIZE = 20;
const MAX_PAGE = 100_000;

export function parsePage(search: URLSearchParams): number {
  const text = search.get("page");
  const page = text && /^\d{1,6}$/.test(text) ? Number(text) : 1;
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:comments.title"), t("appName"));
}

/**
 * 댓글 관리(`/:handle/manage/comments`, SSR, 006 FR-099의 001 범위): 내 블로그 모든 글의 댓글을 최신순으로 보고 지운다.
 * 휴지통 글의 댓글과 삭제된 댓글 자리는 backend가 빼고 준다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const page = parsePage(new URL(request.url).searchParams);
  const comments = await createApiClient(request)
    .send<ManageComment[]>(`/blogs/${handle}/manage/comments`, {
      query: { page: page - 1, size: MANAGE_COMMENTS_PAGE_SIZE },
    })
    .catch(throwManageError);
  return {
    handle,
    page,
    comments: comments.result,
    totalCount: comments.totalCount ?? comments.result.length,
  };
}

/** 댓글 지우기(`DELETE /comments/{id}`, 글 주인 권한). 끝나면 loader가 목록을 다시 읽는다. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  return runCommentAction(request, { returnTo: `/${handle}/manage/comments` });
}

export default function ManageComments() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { handle, page, comments, totalCount } = useLoaderData<typeof loader>();
  const result = useActionData<CommentActionData>();
  const base = `/${handle}/manage/comments`;

  return (
    <main className="manage-comments">
      <h1>{t("manage:comments.title")}</h1>
      {result?.ok && <p role="status">{t("manage:comments.deleted")}</p>}
      <FormAlert message={result && !result.ok ? errorMessage(t, result) : null} />
      {comments.length === 0 ? (
        <p>{t("manage:comments.empty")}</p>
      ) : (
        <ul className="manage-comment-list" aria-label={t("manage:comments.list")}>
          {comments.map((comment) => (
            <li key={comment.id}>
              <p className="comment-content" style={{ whiteSpace: "pre-wrap" }}>
                {comment.content}
              </p>
              <p className="comment-meta">
                <strong>{comment.author?.nickname ?? t("comment:unknownAuthor")}</strong> ·{" "}
                <Link to={`/${handle}/${comment.postId}#comment-${comment.id}`}>
                  {t("manage:comments.on", { title: comment.postTitle })}
                </Link>{" "}
                <time dateTime={comment.createdAt}>{format.dateTime(comment.createdAt)}</time>
              </p>
              <DeleteCommentButton
                commentId={comment.id}
                label={t("manage:comments.delete")}
                confirmMessage={t("manage:comments.deleteConfirm")}
              />
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={MANAGE_COMMENTS_PAGE_SIZE}
        hrefFor={(target) => (target > 1 ? `${base}?page=${target}` : base)}
      />
    </main>
  );
}
