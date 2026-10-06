import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import { FormAlert, FormField } from "~/components/form/FormField";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/password-reset";

type PasswordResetActionData =
  { sent: true; email: string } | (FormErrorData & { sent: false; email: string });

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("auth:passwordReset.title"), t("appName"));
}

/**
 * 비밀번호 재설정 요청(FR-133). backend는 가입 여부와 관계없이 같은 202를 주므로
 * 화면도 항상 같은 안내를 보여준다(가입 여부를 드러내지 않음). 입력 형식 오류만 입력란에 보여준다.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const missing = requiredErrors({ email });
  if (missing.length > 0) {
    return data<PasswordResetActionData>(
      { sent: false, email, resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).post("/auth/password-reset/request", { body: { email } });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<PasswordResetActionData>({ ...formError, sent: false, email }, { status });
  }
  return data<PasswordResetActionData>({ sent: true, email });
}

export default function PasswordReset() {
  const { t } = useTranslation();
  const result = useActionData<PasswordResetActionData>();
  const messages = useFormMessages(result && !result.sent ? result : null);
  const submitting = useNavigation().state === "submitting";

  return (
    <main>
      <h1>{t("auth:passwordReset.title")}</h1>
      <p>{t("auth:passwordReset.intro")}</p>
      {result?.sent && <p role="status">{t("auth:passwordReset.sent")}</p>}
      <Form method="post">
        <FormAlert message={messages.form} />
        <FormField
          label={t("auth:passwordReset.email")}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={result?.email}
          error={messages.fields.email}
        />
        <button type="submit" disabled={submitting}>
          {t("auth:passwordReset.submit")}
        </button>
      </Form>
    </main>
  );
}
