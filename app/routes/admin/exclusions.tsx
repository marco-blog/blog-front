import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { parsePostRef } from "~/admin/postRef";
import { createApiClient } from "~/api/client.server";
import type { Exclusion } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { parsePage, withPage } from "~/blog/listing";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { Pagination } from "~/components/Pagination";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/exclusions";

export const EXCLUSION_PAGE_SIZE = 20;
/** backend `PortalExclusion.REASON_MAX`와 같다. */
export const EXCLUSION_REASON_MAX = 500;
const PATH = "/admin/portal/exclusions";
const INTENTS = ["exclude", "unexclude"] as const;
type Intent = (typeof INTENTS)[number];

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:exclusions.title"), t("appName"));
}

/** 포털 제외(`/admin/portal/exclusions`, 003 T102, FR-093): 목록, 글 주소·번호 + 사유로 제외, 사유 수정, 해제 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const response = await createApiClient(request)
    .send<Exclusion[]>("/admin/portal/exclusions", {
      query: { page: page - 1, size: EXCLUSION_PAGE_SIZE },
    })
    .catch(throwAdminError);
  return {
    page,
    exclusions: response.result,
    totalCount: response.totalCount ?? response.result.length,
  };
}

/** 제외(없으면 만들고 있으면 사유만 바꿈, backend PUT 멱등)·해제 */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  if (!(INTENTS as readonly string[]).includes(intentText)) {
    return adminInvalid(intentText);
  }
  const intent = intentText as Intent;
  const postId = parsePostRef(String(form.get("postRef") ?? ""));
  if (postId === null) {
    return adminInvalid(intent, [{ field: "postRef", code: "INVALID_FORMAT" }]);
  }
  const api = createApiClient(request);
  try {
    if (intent === "unexclude") {
      await api.delete(`/admin/portal/exclusions/${postId}`);
    } else {
      const reason = String(form.get("reason") ?? "").trim();
      const errors: ApiFieldError[] = !reason
        ? [{ field: "reason", code: "REQUIRED" }]
        : reason.length > EXCLUSION_REASON_MAX
          ? [{ field: "reason", code: "TOO_LONG", params: { max: EXCLUSION_REASON_MAX } }]
          : [];
      if (errors.length > 0) {
        return adminInvalid(intent, errors);
      }
      await api.put(`/admin/portal/exclusions/${postId}`, { body: { reason } });
    }
  } catch (error) {
    return adminActionError(intent, error);
  }
  return data<AdminActionData>({ intent, ok: true });
}

export default function AdminExclusions() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { page, exclusions, totalCount } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";

  return (
    <main className="admin-exclusions">
      <h1>{t("admin:exclusions.title")}</h1>
      <p>{t("admin:exclusions.hint")}</p>
      {result?.ok && <p role="status">{t(`admin:exclusions.done.${result.intent}`)}</p>}
      <AdminFormErrors error={result && !result.ok ? result : null} />

      <Form method="post" className="exclusion-add" key={`add-${totalCount}`}>
        <fieldset>
          <legend>{t("admin:exclusions.add")}</legend>
          <input type="hidden" name="intent" value="exclude" />
          <label>
            {t("admin:fields.postRef")}{" "}
            <input name="postRef" required placeholder="https://blog.java21.net/marco/123" />
          </label>{" "}
          <label>
            {t("admin:fields.reason")}{" "}
            <input name="reason" required maxLength={EXCLUSION_REASON_MAX} />
          </label>{" "}
          <button type="submit" disabled={submitting}>
            {t("admin:exclusions.exclude")}
          </button>
          <p className="form-hint">{t("admin:lookup.hint")}</p>
        </fieldset>
      </Form>

      {exclusions.length === 0 ? (
        <p>{t("admin:exclusions.empty")}</p>
      ) : (
        <ul className="admin-exclusion-list" aria-label={t("admin:exclusions.list")}>
          {exclusions.map((exclusion) => (
            <li key={exclusion.post.id}>
              <section aria-label={exclusion.post.title} className="admin-exclusion">
                <h2>
                  <Link to={`/${exclusion.post.blogHandle}/${exclusion.post.id}`}>
                    {exclusion.post.title}
                  </Link>{" "}
                  <span>@{exclusion.post.blogHandle}</span>
                </h2>
                <p>
                  {t("admin:exclusions.by", {
                    nickname: exclusion.excludedBy.nickname,
                    time: format.dateTime(exclusion.updatedAt),
                  })}
                </p>
                <Form method="post" key={`${exclusion.post.id}-${exclusion.reason}`}>
                  <input type="hidden" name="intent" value="exclude" />
                  <input type="hidden" name="postRef" value={exclusion.post.id} />
                  <label>
                    {t("admin:fields.reason")}{" "}
                    <input
                      name="reason"
                      required
                      maxLength={EXCLUSION_REASON_MAX}
                      defaultValue={exclusion.reason}
                    />
                  </label>{" "}
                  <button type="submit" disabled={submitting}>
                    {t("admin:exclusions.saveReason")}
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="unexclude" />
                  <input type="hidden" name="postRef" value={exclusion.post.id} />
                  <button type="submit" disabled={submitting}>
                    {t("admin:exclusions.unexclude")}
                  </button>
                </Form>
              </section>
            </li>
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={EXCLUSION_PAGE_SIZE}
        hrefFor={(number) => withPage(PATH, number)}
      />
    </main>
  );
}
