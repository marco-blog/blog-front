import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import type { MyBlog, MyBlogs } from "~/api/models";
import { requireUser } from "~/auth/session.server";
import { FormAlert, FormField } from "~/components/form/FormField";
import { HandleField } from "~/components/form/HandleField";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/settings.blogs";

type Intent = "create" | "delete";

type BlogsActionData =
  | { intent: Intent; ok: true; handle: string }
  | (FormErrorData & { intent: Intent | null; ok: false; handle: string });

/** 새 블로그 만들기에서 주소 입력란에 붙일 오류 */
const CREATE_FIELD_BY_CODE: Record<string, string> = {
  HANDLE_TAKEN: "handle",
  HANDLE_RESERVED: "handle",
  HANDLE_INVALID: "handle",
};

/** 삭제에서 비밀번호 입력란에 붙일 오류 */
const DELETE_FIELD_BY_CODE: Record<string, string> = {
  CURRENT_PASSWORD_MISMATCH: "password",
};

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("settings:blogs.title"), t("appName"));
}

/** 내 블로그 목록과 블로그 수 / 한도(FR-158). 여러 블로그가 있을 때 `/write`·`/manage`의 블로그 선택 화면도 겸한다. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const blogs = await createApiClient(request)
    .get<MyBlogs>("/me/blogs")
    .catch(throwApiErrorResponse);
  return { blogs };
}

/** 블로그 만들기(`POST /blogs`)와 삭제(`DELETE /blogs/{handle}`, 비밀번호 확인, FR-159) */
export async function action({ request }: Route.ActionArgs) {
  await requireUser(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const handle = String(form.get("handle") ?? "").trim();
  const api = createApiClient(request);

  if (intent === "create") {
    const title = String(form.get("title") ?? "").trim();
    const missing = requiredErrors({ handle });
    if (missing.length > 0) {
      return data<BlogsActionData>(
        {
          intent,
          ok: false,
          handle,
          resultCode: VALIDATION_FAILED,
          field: null,
          fieldErrors: missing,
        },
        { status: 400 },
      );
    }
    try {
      await api.post("/blogs", { body: title ? { handle, title } : { handle } });
    } catch (error) {
      const { data: formError, status } = toFormError(error, CREATE_FIELD_BY_CODE);
      return data<BlogsActionData>({ ...formError, intent, ok: false, handle }, { status });
    }
    return data<BlogsActionData>({ intent, ok: true, handle });
  }

  if (intent === "delete") {
    const password = String(form.get("password") ?? "");
    const missing = requiredErrors({ password });
    if (missing.length > 0) {
      return data<BlogsActionData>(
        {
          intent,
          ok: false,
          handle,
          resultCode: VALIDATION_FAILED,
          field: null,
          fieldErrors: missing,
        },
        { status: 400 },
      );
    }
    try {
      await api.delete(`/blogs/${encodeURIComponent(handle)}`, { body: { password } });
    } catch (error) {
      const { data: formError, status } = toFormError(error, DELETE_FIELD_BY_CODE);
      return data<BlogsActionData>({ ...formError, intent, ok: false, handle }, { status });
    }
    return data<BlogsActionData>({ intent, ok: true, handle });
  }

  return data<BlogsActionData>(
    {
      intent: null,
      ok: false,
      handle,
      resultCode: VALIDATION_FAILED,
      field: null,
      fieldErrors: [],
    },
    { status: 400 },
  );
}

export default function SettingsBlogs() {
  const { t } = useTranslation();
  const { blogs } = useLoaderData<typeof loader>();
  const result = useActionData<BlogsActionData>();
  const atLimit = blogs.count >= blogs.limit;

  let notice: string | null = null;
  if (result?.ok) {
    notice = t(
      result.intent === "create"
        ? "settings:blogs.create.created"
        : "settings:blogs.delete.deleted",
    );
  }

  return (
    <main>
      <h1>{t("settings:blogs.title")}</h1>
      <p>{t("settings:blogs.count", { count: blogs.count, limit: blogs.limit })}</p>
      {notice && <p role="status">{notice}</p>}
      <ul className="my-blogs">
        {blogs.items.map((blog) => (
          <BlogItem
            key={blog.handle}
            blog={blog}
            deletable={blogs.count > 1}
            error={
              result && !result.ok && result.intent === "delete" && result.handle === blog.handle
                ? result
                : null
            }
          />
        ))}
      </ul>
      <CreateBlogForm
        key={result?.ok && result.intent === "create" ? result.handle : "create"}
        atLimit={atLimit}
        error={result && !result.ok && result.intent === "create" ? result : null}
      />
    </main>
  );
}

function BlogItem({
  blog,
  deletable,
  error,
}: {
  blog: MyBlog;
  deletable: boolean;
  error: FormErrorData | null;
}) {
  const { t } = useTranslation();
  const messages = useFormMessages(error);
  const submitting = useNavigation().state === "submitting";
  return (
    <li>
      <h2>
        <Link to={`/${blog.handle}`}>{blog.title}</Link>
      </h2>
      <p>
        <code>/{blog.handle}</code> ·{" "}
        <span>{t("settings:blogs.posts", { posts: blog.postCount })}</span>
      </p>
      <p>
        <Link to={`/${blog.handle}/manage`}>{t("settings:blogs.manage")}</Link>{" "}
        <Link to={`/${blog.handle}/write`}>{t("settings:blogs.write")}</Link>
      </p>
      {deletable && (
        <details open={Boolean(error)}>
          <summary>{t("settings:blogs.delete.open")}</summary>
          <Form method="post">
            <p>{t("settings:blogs.delete.warning")}</p>
            <FormAlert message={messages.form} />
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="handle" value={blog.handle} />
            <FormField
              label={t("settings:blogs.delete.password")}
              name="password"
              type="password"
              autoComplete="current-password"
              required
              error={messages.fields.password}
            />
            <button type="submit" disabled={submitting}>
              {t("settings:blogs.delete.submit")}
            </button>
          </Form>
        </details>
      )}
    </li>
  );
}

function CreateBlogForm({
  atLimit,
  error,
}: {
  atLimit: boolean;
  error: (FormErrorData & { handle: string }) | null;
}) {
  const { t } = useTranslation();
  const messages = useFormMessages(error);
  const submitting = useNavigation().state === "submitting";
  return (
    <Form method="post" className="create-blog">
      <h2>{t("settings:blogs.create.title")}</h2>
      {atLimit && <p>{t("settings:blogs.create.limitReached")}</p>}
      <FormAlert message={messages.form} />
      <input type="hidden" name="intent" value="create" />
      <HandleField
        label={t("settings:blogs.create.handle")}
        hint={t("auth:signup.handleHint")}
        defaultValue={error?.handle}
        error={messages.fields.handle}
      />
      <FormField
        label={t("settings:blogs.create.blogTitle")}
        name="title"
        maxLength={100}
        hint={t("settings:blogs.create.titleHint")}
        error={messages.fields.title}
      />
      <button type="submit" disabled={submitting}>
        {t("settings:blogs.create.submit")}
      </button>
    </Form>
  );
}
