import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import type { LoginResult } from "~/api/models";
import { getSessionUser, safeNextPath } from "~/auth/session.server";
import { Captcha, CAPTCHA_FIELD } from "~/components/captcha/Captcha";
import { captchaView, type CaptchaView } from "~/components/captcha/captcha.server";
import { FormAlert, FormField } from "~/components/form/FormField";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/login";

interface LoginActionData extends FormErrorData {
  values: { email: string };
  /** 연속 실패로 CAPTCHA가 필요하면 그 위젯 정보(005 FR-141). 없으면 CAPTCHA 없이 그린다. */
  captcha?: CaptchaView;
}

/** 이 코드면 같은 화면에 CAPTCHA를 보이고 다시 로그인하게 한다 */
const CAPTCHA_CODES = new Set(["CAPTCHA_REQUIRED", "CAPTCHA_FAILED"]);

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("auth:login.title"), t("appName"));
}

/** 로그인 뒤 돌아갈 곳(`next`, 같은 사이트 경로만). 이미 로그인했으면 바로 보낸다. */
export async function loader({ request }: Route.LoaderArgs) {
  const next = safeNextPath(new URL(request.url).searchParams.get("next"));
  if (await getSessionUser(request)) {
    throw redirect(next);
  }
  return { next };
}

/**
 * 로그인(FR-004). backend가 접근·리프레시 쿠키를 설정하고, root 미들웨어가 그 Set-Cookie를 브라우저 응답에 싣는다.
 * INVALID_CREDENTIALS(이메일·비밀번호 중 어느 쪽인지 밝히지 않음)·ACCOUNT_LOCKED는 폼 위 문구로 보여준다.
 * 연속 실패 뒤 backend가 CAPTCHA_REQUIRED(또는 틀린 토큰 CAPTCHA_FAILED)로 답하면 같은 화면에 CAPTCHA를 보이고
 * 이메일은 그대로 둔다(005 FR-141). 한 번 CAPTCHA가 보인 폼은 다음 제출에도 `captchaShown`으로 계속 보인다.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const next = safeNextPath(String(form.get("next") ?? ""));
  const captchaToken = String(form.get(CAPTCHA_FIELD) ?? "");
  const captchaShown = form.get("captchaShown") === "1";

  const missing = requiredErrors({ email, password });
  if (missing.length > 0) {
    return data<LoginActionData>(
      { resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing, values: { email } },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).post<LoginResult>("/auth/login", {
      body: { email, password, ...(captchaToken ? { captchaToken } : {}) },
    });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    const needsCaptcha = captchaShown || CAPTCHA_CODES.has(formError.resultCode);
    return data<LoginActionData>(
      {
        ...formError,
        values: { email },
        ...(needsCaptcha ? { captcha: await captchaView(request, context) } : {}),
      },
      { status },
    );
  }
  return redirect(next);
}

export default function Login() {
  const { t } = useTranslation();
  const { next } = useLoaderData<typeof loader>();
  const actionData = useActionData<LoginActionData>();
  const messages = useFormMessages(actionData);
  const submitting = useNavigation().state === "submitting";

  return (
    <main>
      <h1>{t("auth:login.title")}</h1>
      <Form method="post">
        <FormAlert message={messages.form} />
        <input type="hidden" name="next" value={next} />
        <FormField
          label={t("auth:login.email")}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={actionData?.values.email}
          error={messages.fields.email}
        />
        <FormField
          label={t("auth:login.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={messages.fields.password}
        />
        {actionData?.captcha && (
          <>
            <input type="hidden" name="captchaShown" value="1" />
            <Captcha captcha={actionData.captcha} />
          </>
        )}
        <button type="submit" disabled={submitting}>
          {t("auth:login.submit")}
        </button>
      </Form>
      <p>
        <Link to="/password-reset">{t("auth:login.forgotPassword")}</Link>
      </p>
      <p>
        {t("auth:login.noAccount")} <Link to="/signup">{t("auth:login.signup")}</Link>
      </p>
    </main>
  );
}
