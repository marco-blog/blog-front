import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { addResponseCookie } from "~/api/backendCookies.server";
import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import { requireUser } from "~/auth/session.server";
import { FormAlert } from "~/components/form/FormField";
import {
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  type Language,
} from "~/i18n/config";
import { DEFAULT_TIME_ZONE } from "~/i18n/format";
import { languageCookie } from "~/i18n/languageCookie.server";
import { metaT } from "~/i18n/meta";
import { resolveLanguage } from "~/i18n/resolveLanguage.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/settings.language";

type LanguageActionData = { ok: true } | (FormErrorData & { ok: false });

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("settings:language.title"), t("appName"));
}

/**
 * 선택할 수 있는 시간대: IANA ID 목록(가나다순이 아닌 ID 순). 서버에서 한 번 만들어 넘기므로
 * 서버와 브라우저의 시간대 데이터가 달라도 hydration 결과가 같다. 지금 설정값이 목록에 없으면(옛 별칭 등) 더한다.
 */
export function timeZoneOptions(current: string | null | undefined): string[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  zones.add("UTC");
  if (current) {
    zones.add(current);
  }
  return [...zones].sort();
}

/** 지금 언어(회원 설정, 없으면 지금 화면 언어)와 시간대(`GET /me`, root loader와 같은 요청이면 한 번만 부른다) */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const timeZone = user.timeZone || DEFAULT_TIME_ZONE;
  return {
    locale: resolveLanguage(request, user.locale),
    timeZone,
    timeZones: timeZoneOptions(timeZone),
  };
}

/**
 * 언어·시간대 저장(`PATCH /me` `locale`·`timeZone`, FR-149·FR-153). 저장한 언어는 이 브라우저의 쿠키 `lang`에도 남겨
 * 로그아웃한 뒤에도 같은 언어로 보이게 한다. 저장 후 root loader가 다시 돌아 화면이 새 언어·시간대로 바뀐다.
 */
export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const locale = String(form.get("locale") ?? "");
  const timeZone = String(form.get("timeZone") ?? "").trim();
  const missing = requiredErrors({ locale, timeZone });
  if (missing.length > 0) {
    return data<LanguageActionData>(
      { ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).patch("/me", { body: { locale, timeZone } });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<LanguageActionData>({ ...formError, ok: false }, { status });
  }
  if (isSupportedLanguage(locale)) {
    addResponseCookie(request, languageCookie(locale));
  }
  return data<LanguageActionData>({ ok: true });
}

export default function SettingsLanguage() {
  const { t } = useTranslation();
  const current = useLoaderData<typeof loader>();
  const result = useActionData<LanguageActionData>();
  const submitting = useNavigation().state === "submitting";
  const messages = useFormMessages(result && !result.ok ? result : null);
  const localeId = useId();
  const timeZoneId = useId();

  return (
    <main>
      <h1>{t("settings:language.title")}</h1>
      {result?.ok && <p role="status">{t("settings:language.saved")}</p>}
      <Form method="post" key={`${current.locale}\n${current.timeZone}`}>
        <FormAlert message={messages.form} />
        <div className="form-field">
          <label htmlFor={localeId}>{t("settings:language.language")}</label>
          <select
            id={localeId}
            name="locale"
            defaultValue={current.locale}
            aria-describedby={`${localeId}-hint`}
            aria-invalid={messages.fields.locale ? true : undefined}
          >
            {SUPPORTED_LANGUAGES.map((language: Language) => (
              <option key={language} value={language} lang={language}>
                {LANGUAGE_NAMES[language]}
              </option>
            ))}
          </select>
          {messages.fields.locale && <p className="form-error">{messages.fields.locale}</p>}
          <p id={`${localeId}-hint`} className="form-hint">
            {t("settings:language.languageHint")}
          </p>
        </div>
        <div className="form-field">
          <label htmlFor={timeZoneId}>{t("settings:language.timeZone")}</label>
          <select
            id={timeZoneId}
            name="timeZone"
            defaultValue={current.timeZone}
            aria-describedby={`${timeZoneId}-hint`}
            aria-invalid={messages.fields.timeZone ? true : undefined}
          >
            {current.timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          {messages.fields.timeZone && <p className="form-error">{messages.fields.timeZone}</p>}
          <p id={`${timeZoneId}-hint`} className="form-hint">
            {t("settings:language.timeZoneHint")}
          </p>
        </div>
        <button type="submit" disabled={submitting}>
          {t("settings:language.submit")}
        </button>
      </Form>
    </main>
  );
}
