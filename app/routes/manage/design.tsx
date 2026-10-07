import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import { VALIDATION_FAILED, toFormError, type FormErrorData } from "~/api/formErrors";
import {
  SIDEBAR_ITEM_TYPES,
  type BulkPostRequest,
  type PostSummary,
  type SidebarConfig,
  type SidebarItemType,
} from "~/api/models";
import { parsePostId } from "~/blog/ids";
import { FormAlert } from "~/components/form/FormField";
import { SidebarEditor } from "~/components/manage/SidebarEditor";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/design";

/** 꾸미기 화면의 공지 목록 수 */
export const NOTICE_PAGE_SIZE = 50;

type DesignActionData =
  { intent: string; ok: true } | (FormErrorData & { intent: string; ok: false });

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:design.title"), t("appName"));
}

/** 꾸미기(`/:handle/manage/design`, SSR, 004 FR-059·060): 사이드바 항목 켜기·끄기·순서와 공지 목록·해제 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const api = createApiClient(request);
  const [sidebar, notices] = await Promise.all([
    api.get<SidebarConfig>(`/blogs/${handle}/manage/sidebar`),
    api.get<PostSummary[]>(`/blogs/${handle}/notices`, { query: { size: NOTICE_PAGE_SIZE } }),
  ]).catch(throwManageError);
  return { handle, items: sidebar.items, notices };
}

function isItemType(value: string): value is SidebarItemType {
  return (SIDEBAR_ITEM_TYPES as readonly string[]).includes(value);
}

/**
 * 폼 값으로 사이드바 구성을 만든다. `order`는 지금 순서(10개 모두), `enabled`는 켠 항목, `move`(`up:TYPE`·`down:TYPE`)는 한 칸 옮기기.
 * 항목이 빠지거나 겹치면 null.
 */
export function sidebarFromForm(form: FormData): SidebarConfig | null {
  const order = form.getAll("order").map(String);
  if (
    order.length !== SIDEBAR_ITEM_TYPES.length ||
    new Set(order).size !== order.length ||
    !order.every(isItemType)
  ) {
    return null;
  }
  const enabled = new Set(form.getAll("enabled").map(String));
  const [direction, target] = String(form.get("move") ?? "").split(":");
  const index = order.indexOf(target as SidebarItemType);
  const swapWith = direction === "up" ? index - 1 : direction === "down" ? index + 1 : -1;
  if (index >= 0 && swapWith >= 0 && swapWith < order.length) {
    [order[index], order[swapWith]] = [order[swapWith], order[index]];
  }
  return {
    items: (order as SidebarItemType[]).map((type) => ({ type, enabled: enabled.has(type) })),
  };
}

/** `intent=saveSidebar`(PUT /blogs/{handle}/sidebar) 또는 `intent=unnotice`(일괄 작업 UNNOTICE) */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const invalid = () =>
    data<DesignActionData>(
      { intent, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: [] },
      { status: 400 },
    );
  const api = createApiClient(request);
  try {
    if (intent === "saveSidebar") {
      const config = sidebarFromForm(form);
      if (config === null) {
        return invalid();
      }
      await api.put(`/blogs/${handle}/sidebar`, { body: config });
      return data<DesignActionData>({ intent, ok: true });
    }
    if (intent === "unnotice") {
      const postId = parsePostId(String(form.get("postId") ?? ""));
      if (postId === null) {
        return invalid();
      }
      await api.post(`/blogs/${handle}/manage/posts/bulk`, {
        body: { postIds: [postId], action: "UNNOTICE" } satisfies BulkPostRequest,
      });
      return data<DesignActionData>({ intent, ok: true });
    }
    return invalid();
  } catch (error) {
    const { data: formError, status } = toFormError(error);
    return data<DesignActionData>({ ...formError, intent, ok: false }, { status });
  }
}

export default function ManageDesign() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { handle, items, notices } = useLoaderData<typeof loader>();
  const result = useActionData<DesignActionData>();

  return (
    <main className="manage-design">
      <h1>{t("manage:design.title")}</h1>
      {result?.ok && (
        <p role="status">
          {result.intent === "unnotice" ? t("manage:design.unnoticed") : t("manage:design.saved")}
        </p>
      )}
      <FormAlert message={result && !result.ok ? errorMessage(t, result) : null} />

      <section aria-labelledby="design-sidebar">
        <h2 id="design-sidebar">{t("manage:design.sidebar")}</h2>
        <p className="form-hint">{t("manage:design.sidebarHint")}</p>
        <SidebarEditor
          key={items.map((item) => `${item.type}${item.enabled}`).join()}
          items={items}
        />
      </section>

      <section aria-labelledby="design-notices">
        <h2 id="design-notices">{t("manage:design.notices")}</h2>
        <p className="form-hint">{t("manage:design.noticesHint")}</p>
        {notices.length === 0 ? (
          <p>{t("manage:design.noNotices")}</p>
        ) : (
          <ul aria-label={t("manage:design.notices")}>
            {notices.map((post) => (
              <li key={post.id}>
                <Link to={`/${handle}/${post.id}`}>{post.title}</Link>{" "}
                {post.publishedAt && (
                  <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
                )}{" "}
                <Form method="post" style={{ display: "inline" }}>
                  <input type="hidden" name="intent" value="unnotice" />
                  <input type="hidden" name="postId" value={post.id} />
                  <button
                    type="submit"
                    aria-label={t("manage:design.unnoticeFor", { title: post.title })}
                  >
                    {t("manage:design.unnotice")}
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
