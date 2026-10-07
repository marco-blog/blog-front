import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import type {
  Blog,
  BulkPostRequest,
  BulkPostResult,
  CategoryNode,
  PostStatus,
  PostSummary,
  Visibility,
} from "~/api/models";
import { parsePostId } from "~/blog/ids";
import { Pagination } from "~/components/Pagination";
import { FormAlert } from "~/components/form/FormField";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { postHref } from "~/manage/links";
import { POST_STATUS_FILTERS, POST_VISIBILITY_FILTERS, oneOf } from "~/manage/postFilters";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/posts";

/** 한 페이지 글 수(backend 기본값과 같다) */
export const MANAGE_PAGE_SIZE = 20;
const MAX_PAGE = 100_000;
const QUERY_MAX = 200;

/** 상태·공개 범위 조건 값은 `~/manage/postFilters` 한 곳(006 T018). `HIDDEN`은 관리자가 숨긴 글(005 FR-041) */
const STATUSES = POST_STATUS_FILTERS;
const VISIBILITIES = POST_VISIBILITY_FILTERS;
/** 일괄 작업 버튼 값 → backend 요청 */
const BULK_OPS = {
  PUBLIC: { action: "CHANGE_VISIBILITY", visibility: "PUBLIC" },
  PRIVATE: { action: "CHANGE_VISIBILITY", visibility: "PRIVATE" },
  DELETE: { action: "DELETE" },
  /** 공지로·공지 해제(004 FR-059) */
  NOTICE: { action: "NOTICE" },
  UNNOTICE: { action: "UNNOTICE" },
  /** 카테고리 옮기기. 대상은 폼의 `moveCategoryId`(비우면 미분류) */
  MOVE: { action: "MOVE_CATEGORY" },
} as const satisfies Record<string, Omit<BulkPostRequest, "postIds">>;
type BulkOp = keyof typeof BULK_OPS;

/** 주소의 글 관리 조건(`?status=&visibility=&category=&q=&page=`). 모르는 값은 버린다. */
export interface PostFilters {
  status: PostStatus | null;
  visibility: Visibility | null;
  category: number | null;
  q: string;
  /** 1부터 */
  page: number;
}

export function parseFilters(search: URLSearchParams): PostFilters {
  const pageText = search.get("page");
  const page = pageText && /^\d{1,6}$/.test(pageText) ? Number(pageText) : 1;
  return {
    status: oneOf(STATUSES, search.get("status")),
    visibility: oneOf(VISIBILITIES, search.get("visibility")),
    category: parsePostId(search.get("category")),
    q: (search.get("q") ?? "").trim().slice(0, QUERY_MAX),
    page: page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** 조건 → 주소 쿼리 문자열(`?…`, 빈 값은 뺀다). 첫 페이지는 page를 넣지 않는다. */
export function filtersSearch(filters: PostFilters, page = filters.page): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.category !== null) params.set("category", String(filters.category));
  if (filters.q) params.set("q", filters.q);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

interface CategoryOption {
  id: number;
  name: string;
  depth: number;
}

function flattenCategories(nodes: CategoryNode[], depth = 0): CategoryOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flattenCategories(node.children ?? [], depth + 1),
  ]);
}

export function meta({ matches, location }: Route.MetaArgs) {
  const t = metaT(matches);
  const trash = new URLSearchParams(location.search).get("status") === "DELETED";
  return privatePageMeta(t(trash ? "manage:posts.trashTitle" : "manage:posts.title"), t("appName"));
}

/**
 * 글 관리(`/:handle/manage/posts`, SSR, 006 FR-101)와 휴지통(`?status=DELETED`, FR-084).
 * 조건은 주소 쿼리 문자열 그대로 backend `GET /blogs/{handle}/manage/posts`에 넘기고(페이지만 0부터로 바꿈),
 * 카테고리 필터·옮길 카테고리 목록은 블로그 정보(`GET /blogs/{handle}`)의 카테고리로 만든다(없으면 필터를 숨김).
 * 상위 카테고리로 거르면 하위 카테고리 글도 나온다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const filters = parseFilters(new URL(request.url).searchParams);
  const api = createApiClient(request);
  const [posts, blog] = await Promise.all([
    api.send<PostSummary[]>(`/blogs/${handle}/manage/posts`, {
      query: {
        status: filters.status,
        visibility: filters.visibility,
        category: filters.category,
        q: filters.q || null,
        page: filters.page - 1,
        size: MANAGE_PAGE_SIZE,
      },
    }),
    api.get<Blog>(`/blogs/${handle}`),
  ]).catch(throwManageError);
  return {
    handle,
    filters,
    posts: posts.result,
    totalCount: posts.totalCount ?? posts.result.length,
    categories: flattenCategories(blog.categories ?? []),
  };
}

type PostsActionData =
  | { intent: "bulk"; ok: true; updated: number; skipped: number }
  | { intent: "restore"; ok: true }
  | { intent: "unschedule"; ok: true }
  | { intent: "bulk"; ok: false; noSelection: true }
  | (FormErrorData & { intent: string; ok: false; noSelection?: false });

/**
 * 일괄 작업(`POST /blogs/{handle}/manage/posts/bulk`: 공개·비공개로 바꾸기, 휴지통으로, 카테고리 옮기기)과
 * 휴지통 복구(`POST /posts/{id}/restore`), 예약 취소(`POST /posts/{id}/unschedule`, 004 FR-064). 끝나면 loader가 목록을 다시 읽는다.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const api = createApiClient(request);

  if (intent === "bulk") {
    const op = String(form.get("op") ?? "");
    const postIds = [
      ...new Set(
        form
          .getAll("postIds")
          .map((value) => parsePostId(String(value)))
          .filter((id): id is number => id !== null),
      ),
    ];
    if (!(op in BULK_OPS)) {
      return invalid(intent);
    }
    if (postIds.length === 0) {
      return data<PostsActionData>({ intent, ok: false, noSelection: true }, { status: 400 });
    }
    const body: BulkPostRequest = { postIds, ...BULK_OPS[op as BulkOp] };
    if (op === "MOVE") {
      body.categoryId = parsePostId(String(form.get("moveCategoryId") ?? ""));
    }
    try {
      const result = await api.post<BulkPostResult>(`/blogs/${handle}/manage/posts/bulk`, {
        body,
      });
      return data<PostsActionData>({
        intent,
        ok: true,
        updated: result.updated,
        skipped: result.skipped ?? 0,
      });
    } catch (error) {
      const { data: formError, status } = toFormError(error);
      return data<PostsActionData>({ ...formError, intent, ok: false }, { status });
    }
  }

  if (intent === "restore" || intent === "unschedule") {
    const postId = parsePostId(String(form.get("postId") ?? ""));
    if (postId === null) {
      return invalid(intent);
    }
    try {
      await api.post(`/posts/${postId}/${intent}`);
      return data<PostsActionData>({ intent, ok: true });
    } catch (error) {
      const { data: formError, status } = toFormError(error);
      return data<PostsActionData>({ ...formError, intent, ok: false }, { status });
    }
  }

  return invalid(intent);
}

function invalid(intent: string) {
  return data<PostsActionData>(
    { intent, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: [] },
    { status: 400 },
  );
}

export default function ManagePosts() {
  const { t } = useTranslation();
  const { handle, filters, posts, totalCount, categories } = useLoaderData<typeof loader>();
  const result = useActionData<PostsActionData>();
  const trash = filters.status === "DELETED";
  const base = `/${handle}/manage/posts`;

  return (
    <main className="manage-posts">
      <h1>{t(trash ? "manage:posts.trashTitle" : "manage:posts.title")}</h1>
      <nav aria-label={t("manage:posts.views.label")}>
        <Link to={base} aria-current={trash ? undefined : "page"}>
          {t("manage:posts.views.all")}
        </Link>{" "}
        <Link to={`${base}?status=DELETED`} aria-current={trash ? "page" : undefined}>
          {t("manage:posts.views.trash")}
        </Link>
      </nav>

      <FilterForm key={filtersSearch(filters)} filters={filters} categories={categories} />
      <ActionResult result={result} />

      {trash ? (
        <TrashList posts={posts} />
      ) : (
        <BulkList
          key={posts.map((post) => post.id).join(",")}
          handle={handle}
          posts={posts}
          categories={categories}
        />
      )}

      <Pagination
        page={filters.page}
        totalCount={totalCount}
        pageSize={MANAGE_PAGE_SIZE}
        hrefFor={(page) => `${base}${filtersSearch(filters, page)}`}
      />
    </main>
  );
}

function FilterForm({
  filters,
  categories,
}: {
  filters: PostFilters;
  categories: CategoryOption[];
}) {
  const { t } = useTranslation();
  const trash = filters.status === "DELETED";
  return (
    <Form method="get" role="search" aria-label={t("manage:posts.filter.label")}>
      {trash ? (
        <input type="hidden" name="status" value="DELETED" />
      ) : (
        <label>
          {t("manage:posts.filter.status")}{" "}
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">{t("manage:posts.filter.all")}</option>
            <option value="DRAFT">{t("manage:status.DRAFT")}</option>
            <option value="PUBLISHED">{t("manage:status.PUBLISHED")}</option>
            <option value="SCHEDULED">{t("manage:status.SCHEDULED")}</option>
            <option value="HIDDEN">{t("manage:status.HIDDEN")}</option>
          </select>
        </label>
      )}{" "}
      <label>
        {t("manage:posts.filter.visibility")}{" "}
        <select name="visibility" defaultValue={filters.visibility ?? ""}>
          <option value="">{t("manage:posts.filter.all")}</option>
          {VISIBILITIES.map((visibility) => (
            <option key={visibility} value={visibility}>
              {t(`manage:visibility.${visibility}`)}
            </option>
          ))}
        </select>
      </label>{" "}
      {categories.length > 0 && (
        <label>
          {t("manage:posts.filter.category")}{" "}
          <select name="category" defaultValue={filters.category ?? ""}>
            <option value="">{t("manage:posts.filter.all")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {`${"— ".repeat(category.depth)}${category.name}`}
              </option>
            ))}
          </select>
        </label>
      )}{" "}
      <label>
        {t("manage:posts.filter.query")}{" "}
        <input type="search" name="q" defaultValue={filters.q} maxLength={QUERY_MAX} />
      </label>{" "}
      <button type="submit">{t("manage:posts.filter.submit")}</button>
    </Form>
  );
}

function ActionResult({ result }: { result: PostsActionData | undefined }) {
  const { t } = useTranslation();
  const error = result && !result.ok && !result.noSelection ? result : null;
  const messages = useFormMessages(error);
  if (!result) {
    return null;
  }
  if (result.ok) {
    return (
      <p role="status">
        {result.intent === "bulk"
          ? [
              t("manage:posts.bulk.done", { updated: result.updated }),
              ...(result.skipped > 0
                ? [t("manage:posts.bulk.skipped", { count: result.skipped })]
                : []),
            ].join(" ")
          : result.intent === "unschedule"
            ? t("manage:posts.unscheduled")
            : t("manage:posts.restored")}
      </p>
    );
  }
  return (
    <FormAlert message={result.noSelection ? t("manage:posts.bulk.noneSelected") : messages.form} />
  );
}

function PostMeta({ post }: { post: PostSummary }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  return (
    <p className="post-meta">
      <span>
        {t("manage:posts.category")}: {post.category?.name ?? t("category:uncategorized")}
      </span>{" "}
      · <span>{t(`manage:status.${post.status}`)}</span> ·{" "}
      <span>{t(`manage:visibility.${post.visibility}`)}</span>
      {post.notice && (
        <>
          {" "}
          · <span className="badge badge-notice">{t("manage:posts.noticeBadge")}</span>
        </>
      )}
      {post.hasDraft && post.status === "PUBLISHED" && (
        <>
          {" "}
          · <span>{t("manage:posts.hasDraft")}</span>
        </>
      )}{" "}
      ·{" "}
      {post.deletedAt ? (
        <>
          <span>{t("manage:posts.deletedAt", { date: format.date(post.deletedAt) })}</span> ·{" "}
          <strong>{t("manage:posts.purgeAt", { date: format.date(post.purgeAt) })}</strong>
        </>
      ) : post.status === "SCHEDULED" && post.scheduledAt ? (
        <strong>
          {t("manage:posts.scheduledAt", { date: format.dateTime(post.scheduledAt) })}
        </strong>
      ) : post.publishedAt ? (
        <span>{t("manage:posts.publishedAt", { date: format.date(post.publishedAt) })}</span>
      ) : (
        <span>{t("manage:posts.updatedAt", { date: format.date(post.updatedAt) })}</span>
      )}
    </p>
  );
}

function BulkList({
  handle,
  posts,
  categories,
}: {
  handle: string;
  posts: PostSummary[];
  categories: CategoryOption[];
}) {
  const { t } = useTranslation();
  const submitting = useNavigation().state === "submitting";
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  if (posts.length === 0) {
    return <p>{t("manage:posts.empty")}</p>;
  }
  const allSelected = selected.size === posts.length;
  /** 고른 글이 모두 관리자가 숨긴 글이면 공개 범위·공지 버튼을 끈다(005, 휴지통 이동은 된다) */
  const hiddenIds = new Set(
    posts.filter((post) => post.status === "HIDDEN").map((post) => post.id),
  );
  const onlyHidden = selected.size > 0 && [...selected].every((id) => hiddenIds.has(id));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <>
      <Form method="post" className="bulk-form">
        <input type="hidden" name="intent" value="bulk" />
        <fieldset>
          <legend>{t("manage:posts.bulk.label")}</legend>
          <button type="submit" name="op" value="PUBLIC" disabled={submitting || onlyHidden}>
            {t("manage:posts.bulk.makePublic")}
          </button>{" "}
          <button type="submit" name="op" value="PRIVATE" disabled={submitting || onlyHidden}>
            {t("manage:posts.bulk.makePrivate")}
          </button>{" "}
          <button type="submit" name="op" value="DELETE" disabled={submitting}>
            {t("manage:posts.bulk.delete")}
          </button>{" "}
          <button type="submit" name="op" value="NOTICE" disabled={submitting || onlyHidden}>
            {t("manage:posts.bulk.notice")}
          </button>{" "}
          <button type="submit" name="op" value="UNNOTICE" disabled={submitting || onlyHidden}>
            {t("manage:posts.bulk.unnotice")}
          </button>{" "}
          <span className="bulk-move">
            {t("manage:posts.bulk.move")}:{" "}
            <label>
              {t("manage:posts.bulk.moveTarget")}{" "}
              <select name="moveCategoryId" defaultValue="">
                <option value="">{t("category:uncategorized")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {`${"— ".repeat(category.depth)}${category.name}`}
                  </option>
                ))}
              </select>
            </label>{" "}
            <button type="submit" name="op" value="MOVE" disabled={submitting}>
              {t("manage:posts.bulk.moveSubmit")}
            </button>
          </span>
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(posts.map((post) => post.id)))
            }
          />{" "}
          {t("manage:posts.selectAll")}
        </label>
        <ul className="manage-post-list" aria-label={t("manage:posts.list")}>
          {posts.map((post) => {
            const title = post.title || t("manage:posts.untitled");
            const resume = post.status === "DRAFT" || post.hasDraft;
            return (
              <li key={post.id}>
                <input
                  type="checkbox"
                  name="postIds"
                  value={post.id}
                  aria-label={t("manage:posts.select", { title })}
                  checked={selected.has(post.id)}
                  onChange={() => toggle(post.id)}
                />{" "}
                <Link to={postHref(handle, post)}>{title}</Link>{" "}
                {post.status === "HIDDEN" ? (
                  <span className="badge badge-hidden" title={t("manage:posts.hiddenHint")}>
                    {t("moderation:hidden.badge")}
                  </span>
                ) : (
                  <Link to={`/${handle}/write/${post.id}`}>
                    {t(resume ? "manage:posts.continue" : "manage:posts.edit")}
                  </Link>
                )}
                {post.status === "SCHEDULED" && (
                  <>
                    {" "}
                    {/* 목록 폼 안에 폼을 둘 수 없어 아래 예약 취소 폼을 form 속성으로 가리킨다 */}
                    <button
                      type="submit"
                      form={`unschedule-${post.id}`}
                      disabled={submitting}
                      aria-label={`${t("manage:posts.unschedule")}: ${title}`}
                    >
                      {t("manage:posts.unschedule")}
                    </button>
                  </>
                )}
                <PostMeta post={post} />
                {post.status === "HIDDEN" && (
                  <p className="form-hint">{t("manage:posts.hiddenHint")}</p>
                )}
              </li>
            );
          })}
        </ul>
      </Form>
      {posts
        .filter((post) => post.status === "SCHEDULED")
        .map((post) => (
          <Form key={post.id} method="post" id={`unschedule-${post.id}`} hidden>
            <input type="hidden" name="intent" value="unschedule" />
            <input type="hidden" name="postId" value={post.id} />
          </Form>
        ))}
    </>
  );
}

function TrashList({ posts }: { posts: PostSummary[] }) {
  const { t } = useTranslation();
  const submitting = useNavigation().state === "submitting";
  if (posts.length === 0) {
    return <p>{t("manage:posts.trashEmpty")}</p>;
  }
  return (
    <>
      <p>{t("manage:posts.trashHint")}</p>
      <ul className="manage-post-list" aria-label={t("manage:posts.list")}>
        {posts.map((post) => {
          const title = post.title || t("manage:posts.untitled");
          return (
            <li key={post.id}>
              <strong>{title}</strong>
              <PostMeta post={post} />
              <Form method="post">
                <input type="hidden" name="intent" value="restore" />
                <input type="hidden" name="postId" value={post.id} />
                <button
                  type="submit"
                  disabled={submitting}
                  aria-label={`${t("manage:posts.restore")}: ${title}`}
                >
                  {t("manage:posts.restore")}
                </button>
              </Form>
            </li>
          );
        })}
      </ul>
    </>
  );
}
