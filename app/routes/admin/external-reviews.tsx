import { useTranslation } from "react-i18next";
import { Form, Link, useActionData, useLoaderData } from "react-router";

import { adminNotFound, isAdminDenied, requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import type {
  ClassificationBatchResult,
  ClassificationReview,
  ClassificationReviewStatus,
  TopicNode,
} from "~/api/models";
import { parsePage } from "~/blog/listing";
import { AdminExternalTabs } from "~/components/external/AdminExternalTabs";
import { ReviewTable } from "~/components/external/ReviewTable";
import { FormAlert } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { externalActionError, formId, invalidField } from "~/external/actions.server";
import { batchItems } from "~/external/forms.server";
import { externalErrorMessage, type ExternalFormError } from "~/external/status";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-reviews";

export const REVIEWS_PAGE_SIZE = 20;
/** 일괄 확정 한도(backend `confirm-batch` 1~50건) */
export const REVIEW_BATCH_MAX = 50;
export const REVIEW_STATUSES: readonly ClassificationReviewStatus[] = [
  "PENDING",
  "CONFIRMED",
  "SKIPPED",
];
const PATH = "/admin/external-blogs/reviews";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:admin.reviews.title"), t("appName"));
}

export function reviewsHref(
  status: ClassificationReviewStatus,
  blogId: number | null,
  page = 1,
): string {
  const params = new URLSearchParams();
  if (status !== "PENDING") params.set("status", status);
  if (blogId !== null) params.set("externalBlogId", String(blogId));
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${PATH}?${query}` : PATH;
}

function parseStatus(value: string | null): ClassificationReviewStatus {
  return (REVIEW_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as ClassificationReviewStatus)
    : "PENDING";
}

function parseBlogId(value: string | null): number | null {
  if (!value || !/^\d{1,18}$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * 분류 검수(`/admin/external-blogs/reviews?status=&externalBlogId=&page=`, 007 T071, FR-121): 오래된 순 검수 대기 목록, 줄마다 확정 주제
 * (처음 값은 예측, 예측이 없으면 지금 노출 주제)와 확정, 고른 글 일괄 확정(최대 50건). 이미 처리된 검수는 409 문구로 알린다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const status = parseStatus(search.get("status"));
  const blogId = parseBlogId(search.get("externalBlogId"));
  const page = parsePage(search.get("page"));
  const api = createApiClient(request);
  const [list, topics] = await Promise.all([
    api.send<ClassificationReview[]>("/admin/classification-reviews", {
      query: {
        status,
        ...(blogId !== null ? { externalBlogId: blogId } : {}),
        page: page - 1,
        size: REVIEWS_PAGE_SIZE,
      },
    }),
    api.get<TopicNode[]>("/topics").catch(() => [] as TopicNode[]),
  ]).catch(throwAdminError);
  return {
    status,
    blogId,
    page,
    reviews: list.result,
    totalCount: list.totalCount ?? list.result.length,
    topics,
  };
}

/** `intent=confirm:{id}`(한 건) 또는 `intent=confirm-batch`(체크한 줄). 성공하면 loader가 목록을 다시 읽는다. */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const api = createApiClient(request);
  const form = await request.formData();
  const raw = form.get("intent");
  const intentText = typeof raw === "string" ? raw : "";
  const single = /^confirm:(\d{1,18})$/.exec(intentText);
  const intent = single ? "confirm" : intentText;
  try {
    if (single) {
      const id = Number(single[1]);
      const topicId = formId(form, `topic-${id}`);
      if (topicId === null) {
        throw invalidField("topicId", "REQUIRED");
      }
      await api.post(`/admin/classification-reviews/${id}/confirm`, { body: { topicId } });
      return { intent, ok: true as const, batch: null };
    }
    if (intent === "confirm-batch") {
      const items = batchItems(form);
      if (items.length === 0) {
        return { intent, ok: false as const, error: null, limit: "empty" as const };
      }
      if (items.length > REVIEW_BATCH_MAX) {
        return { intent, ok: false as const, error: null, limit: "max" as const };
      }
      const batch = await api.post<ClassificationBatchResult>(
        "/admin/classification-reviews/confirm-batch",
        { body: { items } },
      );
      return { intent, ok: true as const, batch };
    }
    throw invalidField("intent");
  } catch (error) {
    if (isAdminDenied(error)) {
      throw adminNotFound();
    }
    return externalActionError(intent, error);
  }
}

export default function AdminExternalReviews() {
  const { t } = useTranslation();
  const { status, blogId, page, reviews, totalCount, topics } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const pending = status === "PENDING";
  let notice: string | null = null;
  let alert: string | null = null;
  if (result?.ok) {
    notice = result.batch
      ? t("external:admin.reviews.batchDone", {
          confirmed: result.batch.confirmed.length,
          skipped: result.batch.skipped.length,
        })
      : t("external:admin.reviews.confirmed");
  } else if (result && "limit" in result && result.limit) {
    alert =
      result.limit === "max"
        ? t("external:admin.reviews.batchLimit", { max: REVIEW_BATCH_MAX })
        : t("external:admin.reviews.batchEmpty");
  } else if (result && "error" in result && result.error) {
    alert = externalErrorMessage(t, result.error as ExternalFormError);
  }

  return (
    <main className="admin-external-reviews">
      <AdminExternalTabs />
      <h1>{t("external:admin.reviews.title")}</h1>
      <nav className="status-tabs" aria-label={t("external:admin.reviews.statusLabel")}>
        <ul>
          {REVIEW_STATUSES.map((value) => (
            <li key={value}>
              <Link
                to={reviewsHref(value, blogId)}
                aria-current={value === status ? "page" : undefined}
              >
                {t(`external:admin.reviewStatus.${value}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {blogId !== null && (
        <p>
          {t("external:admin.reviews.blogFilter", { id: blogId })}{" "}
          <Link to={reviewsHref(status, null)}>{t("external:admin.reviews.clearFilter")}</Link>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <FormAlert message={alert} />
      {reviews.length === 0 ? (
        <p>{t("external:admin.reviews.empty")}</p>
      ) : pending ? (
        <Form method="post" action={reviewsHref(status, blogId, page)}>
          <ReviewTable reviews={reviews} topics={topics} pending />
          <button type="submit" name="intent" value="confirm-batch">
            {t("external:admin.reviews.confirmBatch")}
          </button>
        </Form>
      ) : (
        <ReviewTable reviews={reviews} topics={topics} pending={false} />
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={REVIEWS_PAGE_SIZE}
        hrefFor={(target) => reviewsHref(status, blogId, target)}
      />
    </main>
  );
}
