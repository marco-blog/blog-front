import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, useNavigation } from "react-router";

import { useFormMessages } from "~/api/formErrors";
import { GUESTBOOK_MAX_LENGTH } from "~/api/models";
import type { WriterMode } from "~/blog/guestAuthor";
import { GuestFields } from "~/components/comment/GuestFields";
import { SecretToggle } from "~/components/comment/SecretToggle";
import { FormAlert } from "~/components/form/FormField";

import { errorFor, type GuestbookActionData } from "./actions";

export interface GuestbookFormProps {
  /** 쓰는 사람(회원·비회원·로그인 필요) */
  mode: WriterMode;
  /** `mode`가 login일 때 로그인 주소(`/login?next=…`) */
  loginHref: string;
  result?: GuestbookActionData;
}

/**
 * 방명록 쓰기 폼(004 FR-056·057·066). 로그인 회원은 내용·비밀글, 비회원 허용 블로그의 비로그인 방문자는 이름·비밀번호를 더 적는다.
 * 허용하지 않으면 로그인 안내만. 라우트 `action`(`intent=create`)으로 보내므로 JS 없이도 동작한다.
 */
export function GuestbookForm({ mode, loginHref, result }: GuestbookFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const navigation = useNavigation();
  const submitting =
    navigation.state === "submitting" && navigation.formData?.get("target") === "new";
  const messages = useFormMessages(errorFor(result, "new"));

  if (mode === "login") {
    return (
      <p className="guestbook-login">
        <Link to={loginHref}>{t("guestbook:form.loginToWrite")}</Link>
      </p>
    );
  }
  return (
    <Form method="post" className="guestbook-form" aria-label={t("guestbook:form.label")}>
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="target" value="new" />
      <FormAlert message={messages.form} />
      <label htmlFor={id}>{t("guestbook:form.content")}</label>
      <textarea
        id={id}
        name="content"
        required
        rows={4}
        maxLength={GUESTBOOK_MAX_LENGTH}
        aria-describedby={`${id}-hint`}
        aria-invalid={messages.fields.content ? true : undefined}
      />
      <p id={`${id}-hint`} className="field-hint">
        {messages.fields.content ?? t("guestbook:form.maxLength", { max: GUESTBOOK_MAX_LENGTH })}
      </p>
      <SecretToggle disabled={submitting} />
      {mode === "guest" && <GuestFields errors={messages.fields} disabled={submitting} />}
      <button type="submit" disabled={submitting}>
        {t("guestbook:form.submit")}
      </button>
    </Form>
  );
}
