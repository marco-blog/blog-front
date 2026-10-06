import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import { newPasswordErrors } from "~/auth/newPassword";
import { requireUser } from "~/auth/session.server";
import { FormAlert, FormField } from "~/components/form/FormField";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/settings.password";

type PasswordActionData = { ok: true } | (FormErrorData & { ok: false });

/** 현재 비밀번호가 틀리면 그 입력란에 붙인다 */
const FIELD_BY_CODE: Record<string, string> = {
  CURRENT_PASSWORD_MISMATCH: "currentPassword",
};

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("settings:password.title"), t("appName"));
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return null;
}

/**
 * 비밀번호 변경(FR-082, quickstart #20): `PUT /me/password`. 이 기기는 로그인 상태로 남고 다른 기기의 로그인은 끊긴다.
 */
export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const currentPassword = String(form.get("currentPassword") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const newPasswordConfirm = String(form.get("newPasswordConfirm") ?? "");

  const missing = newPasswordErrors({ currentPassword }, newPassword, newPasswordConfirm);
  if (missing.length > 0) {
    return data<PasswordActionData>(
      { ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).put("/me/password", { body: { currentPassword, newPassword } });
  } catch (error) {
    const { data: formError, status } = toFormError(error, FIELD_BY_CODE);
    return data<PasswordActionData>({ ...formError, ok: false }, { status });
  }
  return data<PasswordActionData>({ ok: true });
}

export default function SettingsPassword() {
  const { t } = useTranslation();
  const result = useActionData<PasswordActionData>();
  const messages = useFormMessages(result && !result.ok ? result : null);
  const submitting = useNavigation().state === "submitting";

  return (
    <main>
      <h1>{t("settings:password.title")}</h1>
      {result?.ok && <p role="status">{t("settings:password.changed")}</p>}
      {/* 성공하면 입력을 비우도록 폼을 새로 그린다. */}
      <Form method="post" key={result?.ok ? "changed" : "form"}>
        <FormAlert message={messages.form} />
        <FormField
          label={t("settings:password.current")}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          error={messages.fields.currentPassword}
        />
        <FormField
          label={t("settings:password.new")}
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
          label={t("settings:password.newConfirm")}
          name="newPasswordConfirm"
          type="password"
          autoComplete="new-password"
          required
          error={messages.fields.newPasswordConfirm}
        />
        <button type="submit" disabled={submitting}>
          {t("settings:password.submit")}
        </button>
      </Form>
    </main>
  );
}
