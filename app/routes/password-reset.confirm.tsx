import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import {
  VALIDATION_FAILED,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import { newPasswordErrors } from "~/auth/newPassword";
import { FormAlert, FormField } from "~/components/form/FormField";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/password-reset.confirm";

const TOKEN_INVALID = "PASSWORD_RESET_TOKEN_INVALID";

type ConfirmActionData = { done: true } | (FormErrorData & { done: false });

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("auth:passwordReset.confirm.title"), t("appName"));
}

/** 메일 링크의 `?token=`(원문). 화면에서 숨은 입력으로 다시 보낸다. */
export function loader({ request }: Route.LoaderArgs) {
  return { token: new URL(request.url).searchParams.get("token") ?? "" };
}

/** 새 비밀번호 설정(FR-133). 성공하면 모든 기기의 로그인이 끊긴다(backend). */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const newPasswordConfirm = String(form.get("newPasswordConfirm") ?? "");

  const missing = newPasswordErrors({}, newPassword, newPasswordConfirm);
  if (missing.length > 0) {
    return data<ConfirmActionData>(
      { done: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).post("/auth/password-reset/confirm", {
      body: { token, newPassword },
    });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<ConfirmActionData>({ ...formError, done: false }, { status });
  }
  return data<ConfirmActionData>({ done: true });
}

export default function PasswordResetConfirm() {
  const { t } = useTranslation();
  const { token } = useLoaderData<typeof loader>();
  const result = useActionData<ConfirmActionData>();
  const messages = useFormMessages(result && !result.done ? result : null);
  const submitting = useNavigation().state === "submitting";
  const requestAgain = (
    <Link to="/password-reset">{t("auth:passwordReset.confirm.requestAgain")}</Link>
  );

  if (result?.done) {
    return (
      <main>
        <h1>{t("auth:passwordReset.confirm.title")}</h1>
        <p role="status">{t("auth:passwordReset.confirm.done")}</p>
        <p>
          <Link to="/login">{t("auth:passwordReset.confirm.login")}</Link>
        </p>
      </main>
    );
  }

  if (!token) {
    return (
      <main>
        <h1>{t("auth:passwordReset.confirm.title")}</h1>
        <FormAlert message={errorMessage(t, TOKEN_INVALID)} />
        <p>{requestAgain}</p>
      </main>
    );
  }

  const tokenInvalid = result && !result.done && result.resultCode === TOKEN_INVALID;
  return (
    <main>
      <h1>{t("auth:passwordReset.confirm.title")}</h1>
      <Form method="post">
        <FormAlert message={messages.form} />
        {tokenInvalid && <p>{requestAgain}</p>}
        <input type="hidden" name="token" value={token} />
        <FormField
          label={t("auth:passwordReset.confirm.newPassword")}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={64}
          hint={t("auth:signup.passwordHint")}
          error={messages.fields.newPassword}
        />
        <FormField
          label={t("auth:passwordReset.confirm.newPasswordConfirm")}
          name="newPasswordConfirm"
          type="password"
          autoComplete="new-password"
          required
          error={messages.fields.newPasswordConfirm}
        />
        <button type="submit" disabled={submitting}>
          {t("auth:passwordReset.confirm.submit")}
        </button>
      </Form>
    </main>
  );
}
