import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useRouteLoaderData } from "react-router";

import { errorMessage } from "~/api/errorMessage";
import { useFormMessages } from "~/api/formErrors";
import type { Comment } from "~/api/models";
import { isGuestAuthor, isOwnEntry, writerMode } from "~/blog/guestAuthor";
import { FormAlert } from "~/components/form/FormField";
import { Avatar } from "~/components/media/Avatar";
import { ReportButton } from "~/components/report/ReportButton";
import { useDateFormat } from "~/i18n/format";
import type { RootData } from "~/root";

import { commentErrorFor, type CommentActionData } from "./actions";
import { CommentForm } from "./CommentForm";
import { GuestPasswordPrompt } from "./GuestPasswordPrompt";

export interface CommentSectionProps {
  /** null이면 댓글을 불러오지 못했다 */
  comments: Comment[] | null;
  commentCount: number;
  /** 블로그·글 설정을 모두 반영한 댓글 허용 여부(FR-029, FR-107) */
  commentEnabled: boolean;
  /** 보는 사람이 글 주인인지(남의 댓글도 지울 수 있다, FR-028) */
  isPostOwner: boolean;
  /** 블로그가 비회원 댓글을 허용하는지(004 FR-066). 허용하면 비로그인도 이름·비밀번호로 쓴다 */
  guestWriteEnabled?: boolean;
  /** 비로그인 방문자에게 보여줄 로그인 주소(`/login?next=…`) */
  loginHref: string;
  result?: CommentActionData;
  /** 로그인 회원에게 남의 댓글 "신고" 버튼(005, 글 상세 화면) */
  reportable?: boolean;
}

/** 전체 댓글 수(답글 포함). 새 댓글 폼은 이 값이 바뀌면(작성 성공) 비워진다. */
function countAll(comments: Comment[]): number {
  return comments.reduce((sum, comment) => sum + 1 + comment.replies.length, 0);
}

/**
 * 글 아래 댓글(US3, FR-027~029). 작성자·작성 시각과 함께 작성순으로 보여주고, 답글은 한 단계 들여쓴다(답글에는 답글 버튼 없음).
 * 비로그인은 로그인 안내(블로그가 비회원 댓글을 허용하면 이름·비밀번호 칸), 댓글이 막힌 글은 안내만 보여준다.
 * 수정은 작성자만, 삭제는 작성자와 글 주인만 할 수 있다. 비회원 댓글은 비로그인 방문자가 작성 때의 비밀번호로 고치거나 지운다.
 * 볼 수 없는 비밀 댓글은 "비밀 댓글입니다"(004 FR-065). 내용은 일반 텍스트라 React가 이스케이프해 그린다.
 */
export function CommentSection({
  comments,
  commentCount,
  commentEnabled,
  isPostOwner,
  guestWriteEnabled = false,
  loginHref,
  result,
  reportable = false,
}: CommentSectionProps) {
  const { t } = useTranslation();
  const viewer = useRouteLoaderData<RootData>("root")?.user ?? null;
  const viewerId = viewer?.userId ?? null;
  const mode = writerMode(viewer, guestWriteEnabled);
  const canWrite = mode !== "login" && commentEnabled;

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
              guestWriter={mode === "guest"}
              result={result}
              reportable={reportable}
            />
          ))}
        </ul>
      )}

      {!commentEnabled ? (
        <p role="note">{t("comment:disabled")}</p>
      ) : mode === "login" ? (
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
          showSecret
          guest={mode === "guest"}
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
  /** 답글을 비회원으로 쓰는지(이름·비밀번호 칸) */
  guestWriter?: boolean;
  isReply?: boolean;
  result?: CommentActionData;
  reportable?: boolean;
}

function CommentItem({
  comment,
  viewerId,
  isPostOwner,
  canReply,
  guestWriter = false,
  isReply = false,
  result,
  reportable = false,
}: CommentItemProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const guest = isGuestAuthor(comment.author);
  /** 관리자가 숨긴 댓글(005): 작성 회원에게만 내용과 안내, 다른 사람에게는 답글이 있을 때만 자리. 고치기·지우기·답글은 없다 */
  const hidden = comment.hidden === true;
  const live = !comment.deleted && !hidden;
  const isAuthor = live && isOwnEntry(comment.author, viewerId);
  /** 비회원 댓글을 비로그인 방문자가 비밀번호로 고치거나 지운다 */
  const guestControls = live && guest && viewerId === null;
  const canDelete = live && (isAuthor || isPostOwner);
  const canReport =
    reportable && live && viewerId !== null && !isOwnEntry(comment.author, viewerId);
  const deleteError = commentErrorFor(result, `delete-${comment.id}`);
  const name = comment.author?.nickname ?? t("comment:unknownAuthor");
  /** 결과(오류·내용 받기)가 이 댓글의 폼이면 펼쳐 둔다(JS 없이 새로 그린 화면에서도 보이게) */
  const openFor = (...targets: string[]) =>
    (result !== undefined && targets.includes(result.target)) || undefined;

  return (
    <li className={isReply ? "comment comment-reply" : "comment"} id={`comment-${comment.id}`}>
      {comment.deleted ? (
        <p className="comment-deleted">{t("comment:deleted")}</p>
      ) : hidden && comment.content === null ? (
        <p className="comment-hidden">{t("moderation:hidden.placeholder")}</p>
      ) : (
        <article aria-label={name}>
          <p className="comment-meta">
            <Avatar url={comment.author?.profileImageUrl} /> <strong>{name}</strong>
            {guest && (
              <>
                {" "}
                <span className="badge badge-guest">{t("comment:guest")}</span>
              </>
            )}
            {comment.secret && (
              <>
                {" "}
                <span className="badge badge-secret">
                  <span aria-hidden="true">🔒</span> {t("comment:secret.badge")}
                </span>
              </>
            )}{" "}
            <time dateTime={comment.createdAt}>{format.dateTime(comment.createdAt)}</time>
            {comment.updatedAt !== comment.createdAt && (
              <>
                {" "}
                <span>({t("comment:edited")})</span>
              </>
            )}
          </p>
          {hidden && (
            <p className="moderation-hidden" role="note">
              {t("moderation:hidden.mine")}
            </p>
          )}
          {comment.content === null ? (
            <p className="comment-secret">{t("comment:secret.hidden")}</p>
          ) : (
            <p className="comment-content" style={{ whiteSpace: "pre-wrap" }}>
              {comment.content}
            </p>
          )}
          <FormAlert
            message={deleteError && !guestControls ? errorMessage(t, deleteError) : null}
          />
          <div className="comment-actions">
            {canReply && !isReply && !hidden && (
              <details open={openFor(`reply-${comment.id}`)}>
                <summary>{t("comment:reply")}</summary>
                <CommentForm
                  intent="create"
                  target={`reply-${comment.id}`}
                  parentId={comment.id}
                  label={t("comment:form.replyContent")}
                  submitLabel={t("comment:form.replySubmit")}
                  showSecret
                  guest={guestWriter}
                  result={result}
                />
              </details>
            )}
            {(isAuthor || guestControls) && (
              <details open={openFor(`edit-${comment.id}`, `unlock-${comment.id}`)}>
                <summary>{t("comment:edit")}</summary>
                <EditComment comment={comment} guest={guestControls} result={result} />
              </details>
            )}
            {canDelete && <DeleteCommentButton commentId={comment.id} />}
            {guestControls && !isPostOwner && (
              <details open={openFor(`delete-${comment.id}`)}>
                <summary>{t("comment:delete")}</summary>
                <DeleteCommentButton commentId={comment.id} withPassword result={result} />
              </details>
            )}
            {canReport && <ReportButton type="COMMENT" id={comment.id} />}
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
              reportable={reportable}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 고치기. 비회원 댓글은 비밀번호를 함께 보낸다. 내용을 볼 수 없는 비회원 비밀 댓글은 비밀번호로 먼저 내용을 받는다
 * (`intent=unlockComment`, 결과의 내용을 채운다).
 */
function EditComment({
  comment,
  guest,
  result,
}: {
  comment: Comment;
  guest: boolean;
  result?: CommentActionData;
}) {
  const { t } = useTranslation();
  const unlockTarget = `unlock-${comment.id}`;
  const unlocked =
    result?.ok && result.intent === "unlockComment" && result.target === unlockTarget
      ? result.comment
      : null;
  const unlockMessages = useFormMessages(commentErrorFor(result, unlockTarget));
  const content = unlocked?.content ?? comment.content;
  if (content === null) {
    return (
      <Form method="post" className="comment-unlock-form" aria-label={t("comment:unlock.form")}>
        <input type="hidden" name="intent" value="unlockComment" />
        <input type="hidden" name="target" value={unlockTarget} />
        <input type="hidden" name="commentId" value={comment.id} />
        <p>{t("comment:unlock.hint")}</p>
        <FormAlert message={unlockMessages.form} />
        <GuestPasswordPrompt error={unlockMessages.fields.guestPassword} />
        <button type="submit">{t("comment:unlock.submit")}</button>
      </Form>
    );
  }
  return (
    <CommentForm
      key={unlocked ? "unlocked" : "plain"}
      intent="edit"
      target={`edit-${comment.id}`}
      commentId={comment.id}
      defaultValue={content}
      label={t("comment:form.editContent")}
      submitLabel={t("comment:form.editSubmit")}
      showSecret
      defaultSecret={comment.secret === true}
      askGuestPassword={guest}
      result={result}
    />
  );
}

/** 삭제 버튼. 브라우저에서는 한 번 더 묻는다(JS가 없으면 바로 보낸다). 비회원 댓글은 비밀번호를 함께 보낸다. */
export function DeleteCommentButton({
  commentId,
  label,
  confirmMessage,
  withPassword = false,
  result,
}: {
  commentId: number;
  label?: string;
  confirmMessage?: string;
  withPassword?: boolean;
  result?: CommentActionData;
}) {
  const { t } = useTranslation();
  const messages = useFormMessages(
    withPassword ? commentErrorFor(result, `delete-${commentId}`) : null,
  );
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
      {withPassword && (
        <>
          <FormAlert message={messages.form} />
          <GuestPasswordPrompt error={messages.fields.guestPassword} />
        </>
      )}
      <button type="submit">{label ?? t("comment:delete")}</button>
    </Form>
  );
}
