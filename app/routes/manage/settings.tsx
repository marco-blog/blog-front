import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import type { Blog } from "~/api/models";
import { FormAlert, FormField } from "~/components/form/FormField";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/settings";

/** backend 제한(Blog.TITLE_MAX·DESCRIPTION_MAX)과 같다. */
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 500;

type SettingsActionData = { ok: true } | (FormErrorData & { ok: false });

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:settings.title"), t("appName"));
}

/** 블로그 설정(`/:handle/manage/settings`, SSR): 제목·소개·댓글 허용. 대표 이미지는 US4에서 더한다. */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const blog = await createApiClient(request).get<Blog>(`/blogs/${handle}`).catch(throwManageError);
  return {
    blog: {
      handle: blog.handle,
      title: blog.title,
      description: blog.description,
      commentEnabled: blog.commentEnabled,
    },
  };
}

/** `PATCH /blogs/{handle}`. 소개를 비우면 지운다(null). */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const commentEnabled = form.get("commentEnabled") === "on";
  const missing = requiredErrors({ title });
  if (missing.length > 0) {
    return data<SettingsActionData>(
      { ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).patch(`/blogs/${handle}`, {
      body: { title, description: description || null, commentEnabled },
    });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<SettingsActionData>({ ...formError, ok: false }, { status });
  }
  return data<SettingsActionData>({ ok: true });
}

export default function ManageSettings() {
  const { t } = useTranslation();
  const { blog } = useLoaderData<typeof loader>();
  const result = useActionData<SettingsActionData>();
  const messages = useFormMessages(result && !result.ok ? result : null);
  const submitting = useNavigation().state === "submitting";

  return (
    <main className="manage-settings">
      <h1>{t("manage:settings.title")}</h1>
      {result?.ok && <p role="status">{t("manage:settings.saved")}</p>}
      <Form method="post" key={`${blog.title}|${blog.description ?? ""}|${blog.commentEnabled}`}>
        <FormAlert message={messages.form} />
        <FormField
          label={t("manage:settings.blogTitle")}
          name="title"
          required
          maxLength={TITLE_MAX}
          defaultValue={blog.title}
          error={messages.fields.title}
        />
        <div className="form-field">
          <label htmlFor="blog-description">{t("manage:settings.description")}</label>
          <textarea
            id="blog-description"
            name="description"
            maxLength={DESCRIPTION_MAX}
            defaultValue={blog.description ?? ""}
            aria-invalid={messages.fields.description ? true : undefined}
          />
          {messages.fields.description && (
            <p className="form-error">{messages.fields.description}</p>
          )}
        </div>
        <div className="form-field">
          <label>
            <input type="checkbox" name="commentEnabled" defaultChecked={blog.commentEnabled} />{" "}
            {t("manage:settings.commentEnabled")}
          </label>
          <p className="form-hint">{t("manage:settings.commentHint")}</p>
        </div>
        <button type="submit" disabled={submitting}>
          {t("manage:settings.submit")}
        </button>
      </Form>
    </main>
  );
}
