import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import { useFormMessages, type FormErrorData } from "~/api/formErrors";
import type { PostDetail } from "~/api/models";
import { FormAlert } from "~/components/form/FormField";
import { Avatar } from "~/components/media/Avatar";
import { useDateFormat } from "~/i18n/format";

import { POST_PASSWORD_MAX } from "./ProtectedPasswordField";

/** 보호 글 열기(`intent=unlock`) 결과. 성공하면 같은 주소로 리다이렉트하므로 실패만 남는다. */
export type UnlockActionData = FormErrorData & { intent: "unlock"; ok: false };

export interface LockedPostProps {
  post: Pick<PostDetail, "title" | "author" | "publishedAt">;
  result?: UnlockActionData;
}

/**
 * 열지 않은 보호 글(004 FR-062, contracts/routes.md): 제목·작성자·발행일과 비밀번호 폼만 보여준다(JS 없이 동작).
 * 틀리면 "비밀번호가 맞지 않습니다", 5번 틀려 막히면 남은 분을 알린다(`Retry-After`).
 */
export function LockedPost({ post, result }: LockedPostProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const id = useId();
  const messages = useFormMessages(result ?? null);
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" && navigation.formData?.get("intent") === "unlock";
  return (
    <article className="post post-locked">
      <header>
        <h1>{post.title}</h1>
        <dl className="post-meta">
          <dt>{t("post:detail.author")}</dt>
          <dd>
            <Avatar url={post.author.profileImageUrl} /> {post.author.nickname}
          </dd>
          {post.publishedAt && (
            <>
              <dt>{t("post:detail.publishedAt")}</dt>
              <dd>
                <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
              </dd>
            </>
          )}
        </dl>
      </header>
      <Form method="post" className="unlock-form" aria-label={t("post:locked.form")}>
        <p>
          <span aria-hidden="true">🔒</span> {t("post:locked.message")}
        </p>
        <input type="hidden" name="intent" value="unlock" />
        <FormAlert message={messages.form} />
        <label htmlFor={id}>{t("post:locked.password")}</label>
        <input
          id={id}
          type="password"
          name="password"
          required
          maxLength={POST_PASSWORD_MAX}
          autoComplete="current-password"
          aria-invalid={messages.fields.password ? true : undefined}
          aria-describedby={messages.fields.password ? `${id}-error` : undefined}
        />
        {messages.fields.password && (
          <p id={`${id}-error`} className="form-error">
            {messages.fields.password}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {t("post:locked.submit")}
        </button>
      </Form>
    </article>
  );
}
