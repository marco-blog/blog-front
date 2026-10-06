import { useState } from "react";
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
import type { Blog, TopicNode } from "~/api/models";
import { FormAlert, FormField } from "~/components/form/FormField";
import { ImageUploadField } from "~/components/media/ImageUploadField";
import { TopicSelect } from "~/components/post/TopicSelect";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { imageFieldValue } from "~/media/form";
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

/**
 * 블로그 설정(`/:handle/manage/settings`, SSR): 제목·소개·대표 이미지·댓글 허용, 그리고 003의 "포털에 내 글 노출"(FR-089)과
 * 블로그 기본 주제(FR-077). 주제 트리(`/topics`)를 읽지 못하면 지금 값만 남긴 고르기를 보여준다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const api = createApiClient(request);
  const [blog, topics] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`).catch(throwManageError),
    api.get<TopicNode[]>("/topics").catch(() => [] as TopicNode[]),
  ]);
  return {
    topics,
    blog: {
      handle: blog.handle,
      title: blog.title,
      description: blog.description,
      coverImageUrl: blog.coverImageUrl,
      commentEnabled: blog.commentEnabled,
      portalEnabled: blog.portalEnabled ?? true,
      defaultTopicId: blog.defaultTopicId ?? null,
    },
  };
}

/** `PATCH /blogs/{handle}`. 소개를 비우면 지운다(null). 대표 이미지는 바꿨을 때만 보낸다(지우면 null). */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const commentEnabled = form.get("commentEnabled") === "on";
  const portalEnabled = form.get("portalEnabled") === "on";
  const topicValue = String(form.get("defaultTopicId") ?? "").trim();
  const defaultTopicId = topicValue ? Number(topicValue) : null;
  const coverImageMediaKey = imageFieldValue(form, "coverImageMediaKey");
  const missing = requiredErrors({ title });
  if (missing.length > 0) {
    return data<SettingsActionData>(
      { ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: missing },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).patch(`/blogs/${handle}`, {
      body: {
        title,
        description: description || null,
        commentEnabled,
        portalEnabled,
        defaultTopicId: Number.isSafeInteger(defaultTopicId) ? defaultTopicId : null,
        ...(coverImageMediaKey === undefined ? {} : { coverImageMediaKey }),
      },
    });
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<SettingsActionData>({ ...formError, ok: false }, { status });
  }
  return data<SettingsActionData>({ ok: true });
}

export default function ManageSettings() {
  const { t } = useTranslation();
  const { blog, topics } = useLoaderData<typeof loader>();
  const result = useActionData<SettingsActionData>();
  const messages = useFormMessages(result && !result.ok ? result : null);
  const submitting = useNavigation().state === "submitting";

  return (
    <main className="manage-settings">
      <h1>{t("manage:settings.title")}</h1>
      {result?.ok && <p role="status">{t("manage:settings.saved")}</p>}
      <Form
        method="post"
        key={`${blog.title}|${blog.description ?? ""}|${blog.commentEnabled}|${blog.coverImageUrl ?? ""}|${blog.portalEnabled}|${blog.defaultTopicId ?? ""}`}
      >
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
        <ImageUploadField
          name="coverImageMediaKey"
          label={t("media:cover.label")}
          purpose="BLOG_COVER"
          currentUrl={blog.coverImageUrl}
          preset="cover"
          error={messages.fields.coverImageMediaKey}
          disabled={submitting}
        />
        <div className="form-field">
          <label>
            <input type="checkbox" name="commentEnabled" defaultChecked={blog.commentEnabled} />{" "}
            {t("manage:settings.commentEnabled")}
          </label>
          <p className="form-hint">{t("manage:settings.commentHint")}</p>
        </div>
        <div className="form-field">
          <label>
            <input type="checkbox" name="portalEnabled" defaultChecked={blog.portalEnabled} />{" "}
            {t("manage:settings.portalEnabled")}
          </label>
          <p className="form-hint">{t("manage:settings.portalHint")}</p>
        </div>
        <DefaultTopicField
          topics={topics}
          initial={blog.defaultTopicId}
          error={messages.fields.defaultTopicId}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting}>
          {t("manage:settings.submit")}
        </button>
      </Form>
    </main>
  );
}

/** 블로그 기본 주제(새 글에 미리 골라 둠). 폼으로 보내도록 이름을 붙인 주제 고르기. */
function DefaultTopicField({
  topics,
  initial,
  error,
  disabled,
}: {
  topics: TopicNode[];
  initial: number | null;
  error?: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState<number | null>(initial);
  return (
    <div className="form-field">
      <TopicSelect
        topics={topics}
        value={value}
        onChange={setValue}
        name="defaultTopicId"
        label={t("manage:settings.defaultTopic")}
        disabled={disabled}
      />
      <p className="form-hint">{t("manage:settings.defaultTopicHint")}</p>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
