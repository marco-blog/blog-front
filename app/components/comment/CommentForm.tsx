import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import { useFormMessages } from "~/api/formErrors";
import { COMMENT_MAX_LENGTH } from "~/api/models";
import { FormAlert } from "~/components/form/FormField";

import type { CommentActionData, CommentIntent } from "./actions";

export interface CommentFormProps {
  /** create(댓글·답글) 또는 edit */
  intent: Extract<CommentIntent, "create" | "edit">;
  /** 이 폼을 가리키는 이름(action 결과가 어느 폼의 것인지 가린다): new, reply-{id}, edit-{id} */
  target: string;
  label: string;
  submitLabel: string;
  parentId?: number;
  commentId?: number;
  defaultValue?: string;
  result?: CommentActionData;
}

/**
 * 댓글·답글 쓰기와 수정 폼. 글 상세 라우트의 `action`으로 보내므로 JS 없이도 동작한다.
 * 내용은 일반 텍스트(1~1000자)이며 화면에는 이스케이프해 보여준다.
 */
export function CommentForm({
  intent,
  target,
  label,
  submitLabel,
  parentId,
  commentId,
  defaultValue,
  result,
}: CommentFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" && navigation.formData?.get("target") === target;
  const error = result && !result.ok && result.target === target ? result : null;
  const messages = useFormMessages(error);

  return (
    <Form method="post" className="comment-form" aria-label={label}>
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="target" value={target} />
      {parentId !== undefined && <input type="hidden" name="parentId" value={parentId} />}
      {commentId !== undefined && <input type="hidden" name="commentId" value={commentId} />}
      <FormAlert message={messages.form} />
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name="content"
        required
        rows={3}
        maxLength={COMMENT_MAX_LENGTH}
        defaultValue={defaultValue}
        aria-describedby={`${id}-hint`}
        aria-invalid={messages.fields.content ? true : undefined}
      />
      <p id={`${id}-hint`} className="field-hint">
        {messages.fields.content ?? t("comment:form.maxLength", { max: COMMENT_MAX_LENGTH })}
      </p>
      <button type="submit" disabled={submitting}>
        {submitLabel}
      </button>
    </Form>
  );
}
