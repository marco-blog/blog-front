import { useId, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import { errorMessage } from "~/api/errorMessage";
import { useFormMessages } from "~/api/formErrors";
import { GUESTBOOK_MAX_LENGTH, type GuestbookEntry } from "~/api/models";
import { isGuestAuthor, isOwnEntry } from "~/blog/guestAuthor";
import { GuestPasswordPrompt } from "~/components/comment/GuestPasswordPrompt";
import { SecretToggle } from "~/components/comment/SecretToggle";
import { FormAlert } from "~/components/form/FormField";
import { BlockButton } from "~/components/manage/BlockButton";
import { Avatar } from "~/components/media/Avatar";
import { useDateFormat } from "~/i18n/format";
import { blockableUserId } from "~/manage/blocks";

import { errorFor, type GuestbookActionData } from "./actions";

export interface GuestbookEntryItemProps {
  entry: GuestbookEntry;
  /** 로그인 회원 id(비로그인 null) */
  viewerId: number | null;
  /** 블로그 주인인지(답글·모든 글 삭제) */
  isOwner: boolean;
  isReply?: boolean;
  /** 블로그 관리: 회원 작성자에게 "차단" 버튼(004 US5) */
  showBlock?: boolean;
  result?: GuestbookActionData;
}

/**
 * 방명록 글 한 개와 주인 답글(004 FR-056·057·066). 내용은 일반 텍스트라 React가 이스케이프해 그린다.
 * - 볼 수 없는 비밀글은 "비밀글입니다", 비회원 글은 "비회원" 표시, 답글이 남은 채 지운 글은 "삭제된 글입니다"
 * - 답글은 블로그 주인만(최상위 글에), 삭제는 작성 회원과 주인, 수정은 작성 회원
 * - 비회원 글은 비로그인 방문자가 작성 때의 비밀번호로 고치거나 지운다. 비밀글이면 먼저 비밀번호로 내용을 연다(`unlock`).
 */
export function GuestbookEntryItem({
  entry,
  viewerId,
  isOwner,
  isReply = false,
  showBlock = false,
  result,
}: GuestbookEntryItemProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const guest = isGuestAuthor(entry.author);
  const own = isOwnEntry(entry.author, viewerId);
  const guestControls = guest && viewerId === null;
  const deleteError = errorFor(result, `delete-${entry.id}`);
  const name = entry.author?.nickname ?? t("guestbook:entry.unknownAuthor");
  const blockable = showBlock && isOwner ? blockableUserId(entry.author, viewerId) : null;
  /** 결과(오류·내용 열기)가 이 글의 폼이면 펼쳐 둔다(JS 없이 새로 그린 화면에서도 보이게) */
  const openFor = (...targets: string[]) =>
    (result !== undefined && targets.includes(result.target)) || undefined;

  return (
    <li
      className={isReply ? "guestbook-entry guestbook-reply" : "guestbook-entry"}
      id={`guestbook-${entry.id}`}
    >
      {entry.deleted ? (
        <p className="guestbook-deleted">{t("guestbook:entry.deleted")}</p>
      ) : (
        <article aria-label={name}>
          <p className="guestbook-meta">
            <Avatar url={entry.author?.profileImageUrl} /> <strong>{name}</strong>
            {guest && (
              <>
                {" "}
                <span className="badge badge-guest">{t("guestbook:entry.guest")}</span>
              </>
            )}
            {entry.secret && (
              <>
                {" "}
                <span className="badge badge-secret">
                  <span aria-hidden="true">🔒</span> {t("guestbook:entry.secret")}
                </span>
              </>
            )}{" "}
            <time dateTime={entry.createdAt}>{format.dateTime(entry.createdAt)}</time>
            {entry.updatedAt !== entry.createdAt && (
              <>
                {" "}
                <span>({t("guestbook:entry.edited")})</span>
              </>
            )}
          </p>
          {entry.content === null ? (
            <p className="guestbook-secret">{t("guestbook:entry.secretHidden")}</p>
          ) : (
            <p className="guestbook-content" style={{ whiteSpace: "pre-wrap" }}>
              {entry.content}
            </p>
          )}
          <FormAlert
            message={deleteError && !guestControls ? errorMessage(t, deleteError) : null}
          />
          <div className="guestbook-actions">
            {isOwner && !isReply && (
              <details open={openFor(`reply-${entry.id}`)}>
                <summary>{t("guestbook:entry.reply")}</summary>
                <ReplyForm entryId={entry.id} result={result} />
              </details>
            )}
            {(own || guestControls) && (
              <details open={openFor(`edit-${entry.id}`, `unlock-${entry.id}`)}>
                <summary>{t("guestbook:entry.edit")}</summary>
                <EditForm entry={entry} guest={guestControls} isReply={isReply} result={result} />
              </details>
            )}
            {(own || isOwner) && <DeleteEntryButton entryId={entry.id} />}
            {blockable !== null && <BlockButton userId={blockable} nickname={name} />}
            {guestControls && !isOwner && (
              <details open={openFor(`delete-${entry.id}`)}>
                <summary>{t("guestbook:entry.delete")}</summary>
                <DeleteEntryButton entryId={entry.id} withPassword result={result} />
              </details>
            )}
          </div>
        </article>
      )}
      {entry.replies.length > 0 && (
        <ul
          className="guestbook-replies"
          aria-label={t("guestbook:entry.replies")}
          style={{ marginLeft: "2rem" }}
        >
          {entry.replies.map((reply) => (
            <GuestbookEntryItem
              key={`${reply.id}-${reply.updatedAt}`}
              entry={reply}
              viewerId={viewerId}
              isOwner={isOwner}
              isReply
              showBlock={showBlock}
              result={result}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function useSubmitting(target: string) {
  const navigation = useNavigation();
  return navigation.state === "submitting" && navigation.formData?.get("target") === target;
}

function ContentField({
  label,
  defaultValue,
  error,
}: {
  label: string;
  defaultValue?: string;
  error?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name="content"
        required
        rows={3}
        maxLength={GUESTBOOK_MAX_LENGTH}
        defaultValue={defaultValue}
        aria-describedby={`${id}-hint`}
        aria-invalid={error ? true : undefined}
      />
      <p id={`${id}-hint`} className="field-hint">
        {error ?? t("guestbook:form.maxLength", { max: GUESTBOOK_MAX_LENGTH })}
      </p>
    </>
  );
}

/** 주인 답글(비밀 여부는 원글을 따른다) */
function ReplyForm({ entryId, result }: { entryId: number; result?: GuestbookActionData }) {
  const { t } = useTranslation();
  const target = `reply-${entryId}`;
  const messages = useFormMessages(errorFor(result, target));
  const submitting = useSubmitting(target);
  return (
    <Form
      method="post"
      className="guestbook-reply-form"
      aria-label={t("guestbook:entry.replyForm")}
    >
      <input type="hidden" name="intent" value="reply" />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="parentId" value={entryId} />
      <FormAlert message={messages.form} />
      <ContentField label={t("guestbook:entry.replyContent")} error={messages.fields.content} />
      <button type="submit" disabled={submitting}>
        {t("guestbook:entry.replySubmit")}
      </button>
    </Form>
  );
}

/**
 * 고치기. 회원 글은 내용·비밀글, 비회원 글은 비밀번호를 함께 보낸다.
 * 내용을 볼 수 없는 비회원 비밀글은 비밀번호로 먼저 연다(`intent=unlock`, 결과의 내용을 채운다).
 */
function EditForm({
  entry,
  guest,
  isReply,
  result,
}: {
  entry: GuestbookEntry;
  guest: boolean;
  isReply: boolean;
  result?: GuestbookActionData;
}) {
  const { t } = useTranslation();
  const target = `edit-${entry.id}`;
  const unlockTarget = `unlock-${entry.id}`;
  const unlocked =
    result?.ok && result.intent === "unlock" && result.target === unlockTarget
      ? result.entry
      : null;
  const messages = useFormMessages(errorFor(result, target));
  const unlockMessages = useFormMessages(errorFor(result, unlockTarget));
  const submitting = useSubmitting(target);
  const content = unlocked?.content ?? entry.content;

  if (content === null) {
    return (
      <Form
        method="post"
        className="guestbook-unlock-form"
        aria-label={t("guestbook:entry.unlockForm")}
      >
        <input type="hidden" name="intent" value="unlock" />
        <input type="hidden" name="target" value={unlockTarget} />
        <input type="hidden" name="entryId" value={entry.id} />
        <p>{t("guestbook:entry.unlockHint")}</p>
        <FormAlert message={unlockMessages.form} />
        <GuestPasswordPrompt error={unlockMessages.fields.guestPassword} />
        <button type="submit">{t("guestbook:entry.unlock")}</button>
      </Form>
    );
  }
  return (
    <Form
      method="post"
      className="guestbook-edit-form"
      aria-label={t("guestbook:entry.editForm")}
      key={unlocked ? "unlocked" : "plain"}
    >
      <input type="hidden" name="intent" value="update" />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="entryId" value={entry.id} />
      <FormAlert message={messages.form} />
      <ContentField
        label={t("guestbook:entry.editContent")}
        defaultValue={content}
        error={messages.fields.content}
      />
      {!isReply && <SecretToggle defaultChecked={entry.secret} disabled={submitting} />}
      {guest && <GuestPasswordPrompt error={messages.fields.guestPassword} disabled={submitting} />}
      <button type="submit" disabled={submitting}>
        {t("guestbook:entry.editSubmit")}
      </button>
    </Form>
  );
}

/** 지우기. 브라우저에서는 한 번 더 묻는다(JS가 없으면 바로 보낸다). 비회원 글은 비밀번호를 함께 보낸다. */
export function DeleteEntryButton({
  entryId,
  withPassword = false,
  result,
}: {
  entryId: number;
  withPassword?: boolean;
  result?: GuestbookActionData;
}) {
  const { t } = useTranslation();
  const target = `delete-${entryId}`;
  const messages = useFormMessages(withPassword ? errorFor(result, target) : null);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(t("guestbook:entry.deleteConfirm"))) {
      event.preventDefault();
    }
  };
  return (
    <Form method="post" className="guestbook-delete" onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="entryId" value={entryId} />
      {withPassword && (
        <>
          <FormAlert message={messages.form} />
          <GuestPasswordPrompt error={messages.fields.guestPassword} />
        </>
      )}
      <button type="submit">{t("guestbook:entry.delete")}</button>
    </Form>
  );
}
