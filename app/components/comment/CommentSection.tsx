import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useRouteLoaderData } from "react-router";

import { errorMessage } from "~/api/errorMessage";
import type { Comment } from "~/api/models";
import { FormAlert } from "~/components/form/FormField";
import { Avatar } from "~/components/media/Avatar";
import { useDateFormat } from "~/i18n/format";
import type { RootData } from "~/root";

import type { CommentActionData } from "./actions";
import { CommentForm } from "./CommentForm";

export interface CommentSectionProps {
  /** null이면 댓글을 불러오지 못했다 */
  comments: Comment[] | null;
  commentCount: number;
  /** 블로그·글 설정을 모두 반영한 댓글 허용 여부(FR-029, FR-107) */
  commentEnabled: boolean;
  /** 보는 사람이 글 주인인지(남의 댓글도 지울 수 있다, FR-028) */
  isPostOwner: boolean;
  /** 비로그인 방문자에게 보여줄 로그인 주소(`/login?next=…`) */
  loginHref: string;
  result?: CommentActionData;
}

/** 전체 댓글 수(답글 포함). 새 댓글 폼은 이 값이 바뀌면(작성 성공) 비워진다. */
function countAll(comments: Comment[]): number {
  return comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0);
}

/**
 * 글 아래 댓글(US3, FR-027~029). 작성자·작성 시각과 함께 작성순으로 보여주고, 답글은 한 단계 들여쓴다(답글에는 답글 버튼 없음).
 * 비로그인은 로그인 안내, 댓글이 막힌 글은 안내만 보여준다. 수정은 작성자만, 삭제는 작성자와 글 주인만 할 수 있다.
 * 내용은 일반 텍스트라 React가 이스케이프해 그린다(HTML로 해석하지 않는다).
 */
export function CommentSection({
  comments,
  commentCount,
  commentEnabled,
  isPostOwner,
  loginHref,
  result,
}: CommentSectionProps) {
  const { t } = useTranslation();
  const viewer = useRouteLoaderData<RootData>("root")?.user ?? null;
  const viewerId = viewer?.userId ?? null;
  const canWrite = viewerId !== null && commentEnabled;

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">{t("comment:count", { comments: commentCount })}</h2>

      {comments === null ? (
        <p>{t("comment:loadFailed")}</p>
      ) : comments.length === 0 ? (
        <p>{t("comment:empty")}</p>
      ) : (
        <ul className="comment-list" aria-label={t("comment:list")}>
          {comments.map((comment) => (
            <CommentItem
              key={`${comment.id}-${comment.updatedAt}-${comment.replies.length}`}
              comment={comment}
              viewerId={viewerId}
              isPostOwner={isPostOwner}
              canReply={canWrite && !comment.deleted}
              result={result}
            />
          ))}
        </ul>
      )}

      {!commentEnabled ? (
        <p role="note">{t("comment:disabled")}</p>
      ) : viewerId === null ? (
        <p>
          <Link to={loginHref}>{t("comment:loginToWrite")}</Link>
        </p>
      ) : (
        <CommentForm
          key={comments ? countAll(comments) : "new"}
          intent="create"
          target="new"
          label={t("comment:form.content")}
          submitLabel={t("comment:form.submit")}
          result={result}
        />
      )}
    </section>
  );
}

interface CommentItemProps {
  comment: Comment;
  viewerId: number | null;
  isPostOwner: boolean;
  /** 답글 달기(최상위 댓글에만) */
  canReply: boolean;
  isReply?: boolean;
  result?: CommentActionData;
}

function CommentItem({
  comment,
  viewerId,
  isPostOwner,
  canReply,
  isReply = false,
  result,
}: CommentItemProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const isAuthor = !comment.deleted && viewerId !== null && comment.author?.userId === viewerId;
  const canDelete = !comment.deleted && (isAuthor || isPostOwner);
  const deleteError =
    result && !result.ok && result.target === `delete-${comment.id}` ? result : null;

  return (
    <li className={isReply ? "comment comment-reply" : "comment"} id={`comment-${comment.id}`}>
      {comment.deleted ? (
        <p className="comment-deleted">{t("comment:deleted")}</p>
      ) : (
        <article aria-label={comment.author?.nickname ?? t("comment:unknownAuthor")}>
          <p className="comment-meta">
            <Avatar url={comment.author?.profileImageUrl} />{" "}
            <strong>{comment.author?.nickname ?? t("comment:unknownAuthor")}</strong>{" "}
            <time dateTime={comment.createdAt}>{format.dateTime(comment.createdAt)}</time>
            {comment.updatedAt !== comment.createdAt && (
              <>
                {" "}
                <span>({t("comment:edited")})</span>
              </>
            )}
          </p>
          <p className="comment-content" style={{ whiteSpace: "pre-wrap" }}>
            {comment.content}
          </p>
          <FormAlert message={deleteError ? errorMessage(t, deleteError) : null} />
          <div className="comment-actions">
            {canReply && !isReply && (
              <details>
                <summary>{t("comment:reply")}</summary>
                <CommentForm
                  intent="create"
                  target={`reply-${comment.id}`}
                  parentId={comment.id}
                  label={t("comment:form.replyContent")}
                  submitLabel={t("comment:form.replySubmit")}
                  result={result}
                />
              </details>
            )}
            {isAuthor && (
              <details>
                <summary>{t("comment:edit")}</summary>
                <CommentForm
                  intent="edit"
                  target={`edit-${comment.id}`}
                  commentId={comment.id}
                  defaultValue={comment.content ?? ""}
                  label={t("comment:form.editContent")}
                  submitLabel={t("comment:form.editSubmit")}
                  result={result}
                />
              </details>
            )}
            {canDelete && <DeleteCommentButton commentId={comment.id} />}
          </div>
        </article>
      )}
      {comment.replies.length > 0 && (
        <ul
          className="comment-replies"
          aria-label={t("comment:replies")}
          style={{ marginLeft: "2rem" }}
        >
          {comment.replies.map((reply) => (
            <CommentItem
              key={`${reply.id}-${reply.updatedAt}`}
              comment={reply}
              viewerId={viewerId}
              isPostOwner={isPostOwner}
              canReply={false}
              isReply
              result={result}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** 삭제 버튼. 브라우저에서는 한 번 더 묻는다(JS가 없으면 바로 보낸다). */
export function DeleteCommentButton({
  commentId,
  label,
  confirmMessage,
}: {
  commentId: number;
  label?: string;
  confirmMessage?: string;
}) {
  const { t } = useTranslation();
  const confirmText = confirmMessage ?? t("comment:deleteConfirm");
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(confirmText)) {
      event.preventDefault();
    }
  };
  return (
    <Form method="post" className="comment-delete" onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="target" value={`delete-${commentId}`} />
      <input type="hidden" name="commentId" value={commentId} />
      <button type="submit">{label ?? t("comment:delete")}</button>
    </Form>
  );
}
