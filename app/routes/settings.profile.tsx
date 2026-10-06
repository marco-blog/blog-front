import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form, data, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import { requireUser } from "~/auth/session.server";
import { FormAlert, FormField } from "~/components/form/FormField";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/settings.profile";

type Intent = "profile" | "withdraw";

type ProfileActionData =
  { intent: "profile"; ok: true } | (FormErrorData & { intent: Intent | null; ok: false });

/** 탈퇴 확인에서 비밀번호 입력란에 붙일 오류 */
const WITHDRAW_FIELD_BY_CODE: Record<string, string> = {
  CURRENT_PASSWORD_MISMATCH: "password",
};

export const NICKNAME_MAX = 30;
export const BIO_MAX = 300;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("settings:profile.title"), t("appName"));
}

/** 지금 프로필(`GET /me`, root loader와 같은 요청이면 한 번만 부른다) */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  return { email: user.email, nickname: user.nickname, bio: user.bio };
}

function failure(intent: Intent | null, fieldErrors: FormErrorData["fieldErrors"]) {
  return data<ProfileActionData>(
    { intent, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors },
    { status: 400 },
  );
}

/**
 * 프로필 저장(`PATCH /me` 닉네임·소개, FR-008)과 탈퇴(`DELETE /me` 비밀번호 확인, FR-009).
 * 탈퇴하면 backend가 인증 쿠키를 지우고(root 미들웨어가 브라우저로 전달) 첫 화면으로 보낸다.
 * 프로필 이미지는 이미지 업로드(US4)에서 더한다.
 */
export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const api = createApiClient(request);

  if (intent === "profile") {
    const nickname = String(form.get("nickname") ?? "").trim();
    const bio = String(form.get("bio") ?? "").trim();
    const missing = requiredErrors({ nickname });
    if (missing.length > 0) {
      return failure(intent, missing);
    }
    try {
      await api.patch("/me", { body: { nickname, bio: bio || null } });
    } catch (error) {
      const { data: formError, status } = toFormError(error);
      return data<ProfileActionData>({ ...formError, intent, ok: false }, { status });
    }
    return data<ProfileActionData>({ intent, ok: true });
  }

  if (intent === "withdraw") {
    const password = String(form.get("password") ?? "");
    const missing = requiredErrors({ password });
    if (missing.length > 0) {
      return failure(intent, missing);
    }
    try {
      await api.delete("/me", { body: { password } });
    } catch (error) {
      const { data: formError, status } = toFormError(error, WITHDRAW_FIELD_BY_CODE);
      return data<ProfileActionData>({ ...formError, intent, ok: false }, { status });
    }
    return redirect("/");
  }

  return failure(null, []);
}

export default function SettingsProfile() {
  const { t } = useTranslation();
  const profile = useLoaderData<typeof loader>();
  const result = useActionData<ProfileActionData>();
  const submitting = useNavigation().state === "submitting";
  const profileError = result && !result.ok && result.intent === "profile" ? result : null;
  const withdrawError = result && !result.ok && result.intent === "withdraw" ? result : null;
  const messages = useFormMessages(profileError);
  const bioId = useId();

  return (
    <main>
      <h1>{t("settings:profile.title")}</h1>
      {result?.ok && <p role="status">{t("settings:profile.saved")}</p>}
      <dl>
        <dt>{t("settings:profile.email")}</dt>
        <dd>{profile.email}</dd>
      </dl>
      {/* 저장 후 loader가 다시 읽은 값으로 입력란을 새로 그린다. */}
      <Form method="post" key={`${profile.nickname}\n${profile.bio ?? ""}`}>
        <FormAlert message={messages.form} />
        <input type="hidden" name="intent" value="profile" />
        <FormField
          label={t("settings:profile.nickname")}
          name="nickname"
          autoComplete="nickname"
          required
          maxLength={NICKNAME_MAX}
          defaultValue={profile.nickname}
          error={messages.fields.nickname}
        />
        <div className="form-field">
          <label htmlFor={bioId}>{t("settings:profile.bio")}</label>
          <textarea
            id={bioId}
            name="bio"
            maxLength={BIO_MAX}
            rows={4}
            defaultValue={profile.bio ?? ""}
            aria-invalid={messages.fields.bio ? true : undefined}
            aria-describedby={`${bioId}-hint`}
          />
          {messages.fields.bio && <p className="form-error">{messages.fields.bio}</p>}
          <p id={`${bioId}-hint`} className="form-hint">
            {t("settings:profile.bioHint")}
          </p>
        </div>
        <button type="submit" disabled={submitting}>
          {t("settings:profile.submit")}
        </button>
      </Form>
      <WithdrawSection error={withdrawError} />
    </main>
  );
}

/** 탈퇴 확인(되돌릴 수 없다는 안내 + 비밀번호). JS 없이도 열고 보낼 수 있게 details로 둔다. */
function WithdrawSection({ error }: { error: FormErrorData | null }) {
  const { t } = useTranslation();
  const messages = useFormMessages(error);
  const submitting = useNavigation().state === "submitting";
  return (
    <details className="withdraw" open={Boolean(error)}>
      <summary>{t("settings:profile.withdraw.open")}</summary>
      <Form method="post">
        <p>{t("settings:profile.withdraw.warning")}</p>
        <FormAlert message={messages.form} />
        <input type="hidden" name="intent" value="withdraw" />
        <FormField
          label={t("settings:profile.withdraw.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          error={messages.fields.password}
        />
        <button type="submit" disabled={submitting}>
          {t("settings:profile.withdraw.submit")}
        </button>
      </Form>
    </details>
  );
}
