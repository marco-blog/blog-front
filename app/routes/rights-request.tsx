import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import { safeNextPath } from "~/auth/paths";
import { Captcha, CAPTCHA_FIELD } from "~/components/captcha/Captcha";
import { captchaView } from "~/components/captcha/captcha.server";
import { FormAlert, FormField } from "~/components/form/FormField";
import { ReasonSelect } from "~/components/report/ReasonSelect";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import {
  CONTACT_EMAIL_MAX,
  RIGHTS_BASIS_MAX,
  RIGHTS_REQUEST_REASONS,
  RIGHTS_URL_MAX,
  isHttpUrl,
  rightsRequestFieldErrors,
  type RightsRequestInput,
} from "~/moderation/reasons";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/rights-request";

export const RIGHTS_REQUEST_PATH = "/rights-request";

type RightsRequestActionData = FormErrorData & { values: RightsRequestInput };

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("report:rights.title"), t("appName"));
}

/**
 * `?url=`로 받은 신고 대상 주소. 같은 사이트 경로(`/marco/12#comment-3`)면 서비스 주소를 붙이고, http(s) 절대 주소면 그대로,
 * 그 밖은 비운다.
 */
export function prefillUrl(value: string | null, origin: string): string {
  if (!value) return "";
  if (value.startsWith("/")) {
    const path = safeNextPath(value, "");
    return path ? `${origin}${path}` : "";
  }
  return isHttpUrl(value) && value.length <= RIGHTS_URL_MAX ? value : "";
}

/**
 * 권리 침해 신고(`/rights-request`, 005 FR-040, contracts/routes.md): 회원이 아니어도 대상 주소·사유·권리 근거·연락 이메일과
 * CAPTCHA로 접수한다. 접수(202)하면 `?submitted=1`로 다시 열어 "접수되었습니다" 안내. 검색에 넣지 않는다.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const search = new URL(request.url).searchParams;
  return {
    captcha: await captchaView(request, context),
    targetUrl: prefillUrl(search.get("url"), publicOrigin(request)),
    submitted: search.get("submitted") === "1",
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const values: RightsRequestInput = {
    targetUrl: String(form.get("targetUrl") ?? "").trim(),
    reason: String(form.get("reason") ?? ""),
    rightsBasis: String(form.get("rightsBasis") ?? "").trim(),
    contactEmail: String(form.get("contactEmail") ?? "").trim(),
  };
  const fieldErrors = rightsRequestFieldErrors(values);
  if (fieldErrors.length > 0) {
    return data<RightsRequestActionData>(
      { resultCode: VALIDATION_FAILED, field: null, fieldErrors, values },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).post("/rights-requests", {
      body: { ...values, captchaToken: String(form.get(CAPTCHA_FIELD) ?? "") },
    });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<RightsRequestActionData>({ ...formError, values }, { status });
  }
  throw redirect(`${RIGHTS_REQUEST_PATH}?submitted=1`);
}

export default function RightsRequest() {
  const { t } = useTranslation();
  const { captcha, targetUrl, submitted } = useLoaderData<typeof loader>();
  const result = useActionData<RightsRequestActionData>();
  const messages = useFormMessages(result ?? null);
  const submitting = useNavigation().state === "submitting";
  const basisId = useId();
  const values = result?.values;

  return (
    <main className="rights-request">
      <h1>{t("report:rights.title")}</h1>
      {submitted && !result ? (
        <p role="status">{t("report:rights.submitted")}</p>
      ) : (
        <>
          <p>{t("report:rights.intro")}</p>
          <Form method="post" aria-label={t("report:rights.title")}>
            <FormAlert message={messages.form} />
            <FormField
              label={t("report:rights.targetUrl")}
              name="targetUrl"
              type="url"
              required
              maxLength={RIGHTS_URL_MAX}
              defaultValue={values?.targetUrl ?? targetUrl}
              error={messages.fields.targetUrl}
            />
            <ReasonSelect
              reasons={RIGHTS_REQUEST_REASONS}
              legend={t("report:rights.reason")}
              defaultValue={values?.reason}
              error={messages.fields.reason}
            />
            <div className="form-field">
              <label htmlFor={basisId}>{t("report:rights.rightsBasis")}</label>
              <textarea
                id={basisId}
                name="rightsBasis"
                required
                rows={6}
                maxLength={RIGHTS_BASIS_MAX}
                defaultValue={values?.rightsBasis}
                aria-describedby={`${basisId}-hint`}
                aria-invalid={messages.fields.rightsBasis ? true : undefined}
              />
              <p id={`${basisId}-hint`} className="form-hint">
                {messages.fields.rightsBasis ?? t("report:rights.rightsBasisHint")}
              </p>
            </div>
            <FormField
              label={t("report:rights.contactEmail")}
              name="contactEmail"
              type="email"
              autoComplete="email"
              required
              maxLength={CONTACT_EMAIL_MAX}
              defaultValue={values?.contactEmail}
              error={messages.fields.contactEmail}
            />
            <p className="form-hint">{t("report:rights.privacy")}</p>
            <Captcha captcha={captcha} />
            <button type="submit" disabled={submitting}>
              {t("report:rights.submit")}
            </button>
          </Form>
        </>
      )}
    </main>
  );
}
