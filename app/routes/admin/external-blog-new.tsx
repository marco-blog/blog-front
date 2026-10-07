import { useTranslation } from "react-i18next";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError, adminNotFound, isAdminDenied } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import { fieldErrorMessages } from "~/api/errorMessage";
import type { AdminExternalBlog, FeedPreview as FeedPreviewData, TopicNode } from "~/api/models";
import { AdminExternalTabs } from "~/components/external/AdminExternalTabs";
import { FeedPreview } from "~/components/external/FeedPreview";
import { TopicSelect } from "~/components/external/TopicSelect";
import { FormAlert } from "~/components/form/FormField";
import { externalActionError, formId, formText, invalidField } from "~/external/actions.server";
import { externalErrorMessage, type ExternalFormError } from "~/external/status";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-blog-new";

/** 등록 근거 최대 길이(backend `registration_basis` 500자) */
export const REGISTRATION_BASIS_MAX = 500;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:admin.new.title"), t("appName"));
}

/**
 * 직접 등록(`/admin/external-blogs/new`, 007 T041): 주소 → 미리보기(선택), 기본 주제, 등록 근거(필수) → 등록 후 상세로.
 * 미리보기와 등록이 한 폼이라 주제·근거는 브라우저 필수 검사 대신 action과 backend가 검사한다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const topics = await createApiClient(request).get<TopicNode[]>("/topics").catch(throwAdminError);
  return { topics };
}

interface Values {
  url: string;
  defaultTopicId: number | null;
  registrationBasis: string;
}

/** `intent=preview`(관리자도 회원이므로 같은 미리보기 API) · `intent=create` → POST /admin/external-blogs → 상세로 */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const api = createApiClient(request);
  const form = await request.formData();
  const intent = formText(form, "intent");
  const values: Values = {
    url: formText(form, "url"),
    defaultTopicId: formId(form, "defaultTopicId"),
    registrationBasis: formText(form, "registrationBasis"),
  };
  const fail = (error: unknown) => {
    if (isAdminDenied(error)) {
      throw adminNotFound();
    }
    return externalActionError(intent, error, { values, preview: null as FeedPreviewData | null });
  };
  if (intent === "preview") {
    try {
      const preview = await api.post<FeedPreviewData>("/external-blog-previews", {
        body: { url: values.url },
      });
      return { intent, ok: true as const, values: { ...values, url: preview.feedUrl }, preview };
    } catch (error) {
      return fail(error);
    }
  }
  if (intent !== "create") {
    return fail(invalidField("intent"));
  }
  if (!values.registrationBasis) {
    return fail(invalidField("registrationBasis", "REQUIRED"));
  }
  try {
    const created = await api.post<AdminExternalBlog>("/admin/external-blogs", {
      body: {
        feedUrl: values.url,
        defaultTopicId: values.defaultTopicId,
        registrationBasis: values.registrationBasis,
      },
    });
    throw redirect(`/admin/external-blogs/${created.id}`);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return fail(error);
  }
}

export default function AdminExternalBlogNew() {
  const { t } = useTranslation();
  const { topics } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const values = result?.values;
  const error = result && !result.ok ? (result.error as ExternalFormError) : null;
  const fields = error ? fieldErrorMessages(t, error.fieldErrors) : {};
  const message = error && Object.keys(fields).length === 0 ? externalErrorMessage(t, error) : null;
  const preview = (result?.preview ?? null) as FeedPreviewData | null;
  return (
    <main className="admin-external-blog-new">
      <AdminExternalTabs />
      <p>
        <Link to="/admin/external-blogs">{t("external:manage.detail.back")}</Link>
      </p>
      <h1>{t("external:admin.new.title")}</h1>
      {preview && <FeedPreview preview={preview} />}
      <Form method="post" key={values?.url ?? ""} className="external-admin-create">
        <label htmlFor="external-url">{t("external:manage.new.url")}</label>
        <input
          id="external-url"
          name="url"
          type="text"
          inputMode="url"
          required
          maxLength={1000}
          defaultValue={values?.url ?? ""}
        />
        <p className="field-hint">{t("external:manage.new.urlHint")}</p>
        {(fields.url ?? fields.feedUrl) && (
          <p className="field-error" role="alert">
            {fields.url ?? fields.feedUrl}
          </p>
        )}
        <button type="submit" name="intent" value="preview" formNoValidate>
          {t("external:manage.new.preview")}
        </button>
        <TopicSelect
          topics={topics}
          defaultValue={values?.defaultTopicId ?? null}
          required={false}
          error={fields.defaultTopicId ?? null}
        />
        <label htmlFor="external-basis">{t("external:admin.new.basis")}</label>
        <textarea
          id="external-basis"
          name="registrationBasis"
          aria-required="true"
          maxLength={REGISTRATION_BASIS_MAX}
          defaultValue={values?.registrationBasis ?? ""}
          aria-describedby="external-basis-hint"
        />
        <p id="external-basis-hint" className="field-hint">
          {t("external:admin.new.basisHint")}
        </p>
        {fields.registrationBasis && (
          <p className="field-error" role="alert">
            {fields.registrationBasis}
          </p>
        )}
        <FormAlert message={message} />
        <button type="submit" name="intent" value="create">
          {t("external:admin.new.create")}
        </button>
      </Form>
    </main>
  );
}
