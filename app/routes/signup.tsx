import { useEffect, useRef } from "react";
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
import { throwApiErrorResponse } from "~/api/errors";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import type { LegalDocument, SignupResult } from "~/api/models";
import { Captcha, CAPTCHA_FIELD } from "~/components/captcha/Captcha";
import { captchaView } from "~/components/captcha/captcha.server";
import { FormAlert, FormField } from "~/components/form/FormField";
import { HandleField } from "~/components/form/HandleField";
import { isSupportedLanguage } from "~/i18n/config";
import { resolveLanguage } from "~/i18n/resolveLanguage.server";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/signup";

interface SignupActionData extends FormErrorData {
  values: { email: string; nickname: string; handle: string };
}

/** 입력란에 붙여 보여줄 backend 오류 코드 */
const FIELD_BY_CODE: Record<string, string> = {
  EMAIL_TAKEN: "email",
  HANDLE_TAKEN: "handle",
  HANDLE_RESERVED: "handle",
  HANDLE_INVALID: "handle",
};

const AGREEMENTS = ["agreeTerms", "agreePrivacy", "over14"] as const;

/** IANA 시간대 이름 모양(Asia/Seoul, UTC 등). 형식만 보고 판단은 backend가 한다. */
const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("auth:signup.title"), t("appName"));
}

/**
 * 약관 버전(4개 언어 공통 하나, FR-081·155). 가입 요청의 termsVersion으로 그대로 보낸다.
 * 가입은 CAPTCHA를 거친다(005 FR-141). 위젯 정보는 `GET /captcha/config`로 함께 읽는다.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const [terms, captcha] = await Promise.all([
    createApiClient(request)
      .get<LegalDocument>("/legal/terms", { query: { lang: resolveLanguage(request) } })
      .catch(throwApiErrorResponse),
    captchaView(request, context),
  ]);
  return { termsVersion: terms.version, captcha };
}

/**
 * 회원가입(FR-001~003, FR-081). 가입과 동시에 첫 블로그가 생기고 로그인된다.
 * 성공하면 backend가 준 쿠키를 싣고 내 블로그 홈(`/{handle}`)으로 보낸다.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const text = (name: string) => String(form.get(name) ?? "");
  const values = {
    email: text("email").trim(),
    nickname: text("nickname").trim(),
    handle: text("handle").trim(),
  };
  const password = text("password");
  const agreements = Object.fromEntries(
    AGREEMENTS.map((name) => [name, form.get(name) === "on" || form.get(name) === "true"]),
  ) as Record<(typeof AGREEMENTS)[number], boolean>;

  const missing = requiredErrors({
    email: values.email,
    password,
    nickname: values.nickname,
    handle: values.handle,
    ...agreements,
  });
  if (missing.length > 0) {
    return data<SignupActionData>(
      { resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing, values },
      { status: 400 },
    );
  }

  const locale = text("locale");
  const timeZone = text("timeZone").trim();
  const body = {
    email: values.email,
    password,
    nickname: values.nickname,
    handle: values.handle,
    ...agreements,
    termsVersion: text("termsVersion"),
    ...(isSupportedLanguage(locale) ? { locale } : {}),
    ...(TIME_ZONE_PATTERN.test(timeZone) ? { timeZone } : {}),
    captchaToken: text(CAPTCHA_FIELD),
  };
  let result: SignupResult;
  try {
    result = await createApiClient(request).post<SignupResult>("/auth/signup", { body });
  } catch (error) {
    const { data: formError, status } = toFormError(error, FIELD_BY_CODE);
    return data<SignupActionData>({ ...formError, values }, { status });
  }
  return redirect(`/${result.handle}`);
}

export default function Signup() {
  const { t, i18n } = useTranslation();
  const { termsVersion, captcha } = useLoaderData<typeof loader>();
  const actionData = useActionData<SignupActionData>();
  const messages = useFormMessages(actionData);
  const submitting = useNavigation().state === "submitting";
  const timeZoneRef = useRef<HTMLInputElement>(null);

  // 브라우저 시간대는 브라우저에서만 알 수 있다. JS가 없으면 보내지 않고 backend 기본값(Asia/Seoul)을 쓴다.
  useEffect(() => {
    if (timeZoneRef.current) {
      timeZoneRef.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    }
  }, []);

  const values = actionData?.values;
  return (
    <main>
      <h1>{t("auth:signup.title")}</h1>
      <Form method="post">
        <FormAlert message={messages.form} />
        <input type="hidden" name="termsVersion" value={termsVersion} />
        <input type="hidden" name="locale" value={i18n.language} />
        <input type="hidden" name="timeZone" ref={timeZoneRef} defaultValue="" />
        <FormField
          label={t("auth:signup.email")}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={values?.email}
          error={messages.fields.email}
        />
        <FormField
          label={t("auth:signup.password")}
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={64}
          hint={t("auth:signup.passwordHint")}
          error={messages.fields.password}
        />
        <FormField
          label={t("auth:signup.nickname")}
          name="nickname"
          autoComplete="nickname"
          required
          maxLength={30}
          defaultValue={values?.nickname}
          error={messages.fields.nickname}
        />
        <HandleField
          label={t("auth:signup.handle")}
          hint={t("auth:signup.handleHint")}
          defaultValue={values?.handle}
          error={messages.fields.handle}
        />
        <fieldset>
          <Agreement
            name="agreeTerms"
            label={t("auth:signup.agreeTerms")}
            error={messages.fields.agreeTerms}
          >
            <Link to="/terms" target="_blank" rel="noopener">
              {t("auth:signup.viewTerms")}
            </Link>
          </Agreement>
          <Agreement
            name="agreePrivacy"
            label={t("auth:signup.agreePrivacy")}
            error={messages.fields.agreePrivacy}
          >
            <Link to="/privacy" target="_blank" rel="noopener">
              {t("auth:signup.viewPrivacy")}
            </Link>
          </Agreement>
          <Agreement name="over14" label={t("auth:signup.over14")} error={messages.fields.over14} />
        </fieldset>
        <Captcha captcha={captcha} />
        <button type="submit" disabled={submitting}>
          {t("auth:signup.submit")}
        </button>
      </Form>
      <p>
        {t("auth:signup.haveAccount")} <Link to="/login">{t("auth:signup.login")}</Link>
      </p>
    </main>
  );
}

function Agreement({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="form-check">
      <label>
        <input type="checkbox" name={name} required aria-invalid={error ? true : undefined} />
        {label}
      </label>{" "}
      {children}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
