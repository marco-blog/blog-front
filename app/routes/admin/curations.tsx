import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { parsePostRef } from "~/admin/postRef";
import { localToUtcIso, utcIsoToLocal } from "~/admin/zonedTime";
import { createApiClient } from "~/api/client.server";
import type { AdminPortalPost, Curation, CurationStatus } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { parsePostId } from "~/blog/ids";
import { parsePage } from "~/blog/listing";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { Pagination } from "~/components/Pagination";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/curations";

export const CURATION_PAGE_SIZE = 20;
export const CURATION_STATUSES: readonly CurationStatus[] = ["ACTIVE", "UPCOMING", "ENDED"];
const PATH = "/admin/portal/curations";
const INTENTS = ["lookup", "create", "update", "delete"] as const;
type Intent = (typeof INTENTS)[number];

type CurationsActionData = AdminActionData<{ post?: AdminPortalPost }>;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:curations.title"), t("appName"));
}

function parseStatus(value: string | null): CurationStatus {
  return (CURATION_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as CurationStatus)
    : "ACTIVE";
}

function statusHref(status: CurationStatus, page = 1): string {
  const base = `${PATH}?status=${status}`;
  return page <= 1 ? base : `${base}&page=${page}`;
}

/**
 * 포털 추천(`/admin/portal/curations`, 003 T102, FR-091·092): 상태 탭(진행 중·예정·종료), 글 확인 후 추가, 기간·순서 수정, 삭제.
 * 시각은 관리자 시간대로 입력·표시하고 backend에는 UTC로 보낸다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const status = parseStatus(search.get("status"));
  const page = parsePage(search.get("page"));
  const response = await createApiClient(request)
    .send<Curation[]>("/admin/portal/curations", {
      query: { status, page: page - 1, size: CURATION_PAGE_SIZE },
    })
    .catch(throwAdminError);
  return {
    status,
    page,
    curations: response.result,
    totalCount: response.totalCount ?? response.result.length,
    timeZone: user.timeZone,
  };
}

function periodErrors(startsAt: string | null, endsAt: string | null): ApiFieldError[] {
  return [
    ...(startsAt ? [] : [{ field: "startsAt", code: "REQUIRED" }]),
    ...(endsAt ? [] : [{ field: "endsAt", code: "REQUIRED" }]),
  ];
}

function sortOrderFrom(form: FormData): number | null {
  const text = String(form.get("sortOrder") ?? "").trim();
  if (!text) {
    return 0;
  }
  const value = Number(text);
  return Number.isInteger(value) ? value : null;
}

/** 글 확인(lookup)·추가·수정·삭제 */
export async function action({ request }: Route.ActionArgs) {
  const user = await requireAdmin(request);
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  if (!(INTENTS as readonly string[]).includes(intentText)) {
    return adminInvalid(intentText);
  }
  const intent = intentText as Intent;
  const api = createApiClient(request);

  if (intent === "lookup") {
    const postId = parsePostRef(String(form.get("postRef") ?? ""));
    if (postId === null) {
      return adminInvalid(intent, [{ field: "postRef", code: "INVALID_FORMAT" }]);
    }
    try {
      const post = await api.get<AdminPortalPost>(`/admin/portal/posts/${postId}`);
      return data<CurationsActionData>({ intent, ok: true, post });
    } catch (error) {
      return adminActionError(intent, error);
    }
  }

  const id = parsePostId(String(form.get(intent === "create" ? "postId" : "id") ?? ""));
  if (id === null) {
    return adminInvalid(intent);
  }
  try {
    if (intent === "delete") {
      await api.delete(`/admin/portal/curations/${id}`);
      return data<CurationsActionData>({ intent, ok: true });
    }
    const startsAt = localToUtcIso(String(form.get("startsAt") ?? ""), user.timeZone);
    const endsAt = localToUtcIso(String(form.get("endsAt") ?? ""), user.timeZone);
    const sortOrder = sortOrderFrom(form);
    const errors = [
      ...periodErrors(startsAt, endsAt),
      ...(sortOrder === null ? [{ field: "sortOrder", code: "INVALID" }] : []),
    ];
    if (errors.length > 0) {
      return adminInvalid(intent, errors);
    }
    if (intent === "create") {
      await api.post("/admin/portal/curations", {
        body: { postId: id, startsAt, endsAt, sortOrder },
      });
    } else {
      await api.patch(`/admin/portal/curations/${id}`, { body: { startsAt, endsAt, sortOrder } });
    }
  } catch (error) {
    return adminActionError(intent, error);
  }
  return data<CurationsActionData>({ intent, ok: true });
}

export default function AdminCurations() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { status, page, curations, totalCount, timeZone } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";
  // 확인한 글은 추가에 실패해도 남겨 두고, 추가에 성공하면 닫는다(렌더 중 이전 결과와 비교).
  const [found, setFound] = useState<AdminPortalPost | null>(null);
  const [lastResult, setLastResult] = useState(result);
  if (result !== lastResult) {
    setLastResult(result);
    if (result?.ok && result.intent === "lookup" && "post" in result && result.post) {
      setFound(result.post as AdminPortalPost);
    } else if (result?.ok && result.intent === "create") {
      setFound(null);
    }
  }

  return (
    <main className="admin-curations">
      <h1>{t("admin:curations.title")}</h1>
      <p>{t("admin:curations.hint")}</p>
      <p className="form-hint">{t("admin:timeZone", { timeZone })}</p>
      {result?.ok && result.intent !== "lookup" && (
        <p role="status">{t(`admin:curations.done.${result.intent}`)}</p>
      )}
      <AdminFormErrors error={result && !result.ok ? result : null} />

      <Form method="post" className="curation-lookup">
        <fieldset>
          <legend>{t("admin:curations.add")}</legend>
          <input type="hidden" name="intent" value="lookup" />
          <label>
            {t("admin:fields.postRef")}{" "}
            <input name="postRef" required placeholder="https://blog.java21.net/marco/123" />
          </label>{" "}
          <button type="submit" disabled={submitting}>
            {t("admin:lookup.submit")}
          </button>
          <p className="form-hint">{t("admin:lookup.hint")}</p>
        </fieldset>
      </Form>

      {found && (
        <section aria-label={t("admin:lookup.result")} className="curation-new">
          <PostCheck post={found} />
          {found.portalEligible && (
            <Form method="post" key={found.id}>
              <input type="hidden" name="intent" value="create" />
              <input type="hidden" name="postId" value={found.id} />
              <PeriodInputs />
              <button type="submit" disabled={submitting}>
                {t("admin:curations.create")}
              </button>
            </Form>
          )}
        </section>
      )}

      <nav aria-label={t("admin:curations.tabs")} className="tabs">
        <ul>
          {CURATION_STATUSES.map((value) => (
            <li key={value}>
              <Link to={statusHref(value)} aria-current={value === status ? "page" : undefined}>
                {t(`admin:curations.status.${value}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {curations.length === 0 ? (
        <p>{t("admin:curations.empty")}</p>
      ) : (
        <ul className="admin-curation-list" aria-label={t(`admin:curations.status.${status}`)}>
          {curations.map((curation) => (
            <li key={curation.id}>
              <section aria-label={curation.post.title} className="admin-curation">
                <h2>
                  <Link to={`/${curation.post.blogHandle}/${curation.post.id}`}>
                    {curation.post.title}
                  </Link>{" "}
                  <span>@{curation.post.blogHandle}</span>
                </h2>
                <p>
                  {t("admin:curations.period", {
                    start: format.dateTime(curation.startsAt),
                    end: format.dateTime(curation.endsAt),
                  })}{" "}
                  · {t("admin:curations.sortOrder", { order: curation.sortOrder })} ·{" "}
                  {t("admin:curations.createdBy", { nickname: curation.createdBy.nickname })}
                </p>
                {!curation.portalEligible && (
                  <p className="badge warning">{t("admin:curations.ineligible")}</p>
                )}
                <Form
                  method="post"
                  key={`${curation.id}-${curation.startsAt}-${curation.endsAt}-${curation.sortOrder}`}
                >
                  <input type="hidden" name="intent" value="update" />
                  <input type="hidden" name="id" value={curation.id} />
                  <PeriodInputs
                    startsAt={utcIsoToLocal(curation.startsAt, timeZone)}
                    endsAt={utcIsoToLocal(curation.endsAt, timeZone)}
                    sortOrder={curation.sortOrder}
                  />
                  <button type="submit" disabled={submitting}>
                    {t("admin:curations.save")}
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="id" value={curation.id} />
                  <button type="submit" disabled={submitting}>
                    {t("admin:curations.delete")}
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
        pageSize={CURATION_PAGE_SIZE}
        hrefFor={(number) => statusHref(status, number)}
      />
    </main>
  );
}

function PeriodInputs({
  startsAt = "",
  endsAt = "",
  sortOrder = 0,
}: {
  startsAt?: string;
  endsAt?: string;
  sortOrder?: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label>
        {t("admin:fields.startsAt")}{" "}
        <input type="datetime-local" name="startsAt" required defaultValue={startsAt} />
      </label>{" "}
      <label>
        {t("admin:fields.endsAt")}{" "}
        <input type="datetime-local" name="endsAt" required defaultValue={endsAt} />
      </label>{" "}
      <label>
        {t("admin:fields.sortOrder")}{" "}
        <input type="number" name="sortOrder" step={1} defaultValue={sortOrder} />
      </label>{" "}
    </>
  );
}

/** 글 확인 결과: 제목·블로그·포털 노출 여부와 이유, 제외 정보 */
export function PostCheck({ post }: { post: AdminPortalPost }) {
  const { t } = useTranslation();
  return (
    <div className="post-check">
      <p>
        <Link to={`/${post.blog.handle}/${post.id}`}>{post.title}</Link> ({post.blog.title})
      </p>
      {post.portalEligible ? (
        <p>{t("admin:lookup.eligible")}</p>
      ) : (
        <>
          <p>{t("admin:lookup.ineligible")}</p>
          <ul>
            {post.ineligibleReasons.map((reason) => (
              <li key={reason}>{t(`admin:reasons.${reason}`, { defaultValue: reason })}</li>
            ))}
          </ul>
        </>
      )}
      {post.excluded && <p>{t("admin:lookup.excluded", { reason: post.excluded.reason })}</p>}
    </div>
  );
}
