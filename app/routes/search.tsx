import { useTranslation } from "react-i18next";
import { Form, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { fieldErrorMessages } from "~/api/errorMessage";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import type { SearchPost } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { parsePage, POST_PAGE_SIZE } from "~/blog/listing";
import { FormField } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { PostList } from "~/components/post/PostList";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/search";

/** 검색 화면 주소. 첫 페이지는 `page`를 붙이지 않는다. */
export function searchHref(q: string, page = 1): string {
  const params = new URLSearchParams({ q });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/search?${params.toString()}`;
}

/**
 * 서비스 전체 검색(`/search?q=&page=`, SSR, 002 FR-035). `q`가 비면 API를 부르지 않고 검색창만 보여준다.
 * 검색어 규칙(길이·낱말)은 backend가 검사하고, 입력 오류(`TOO_SHORT`·`TOO_LONG`)는 검색창 아래 문구로 보여준다.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = parsePage(url.searchParams.get("page"));
  const empty = { q, page, pageSize: POST_PAGE_SIZE, posts: [] as SearchPost[], totalCount: 0 };
  if (!q) {
    return { ...empty, searched: false, fieldErrors: [] as ApiFieldError[] };
  }
  try {
    const { result, totalCount } = await createApiClient(request).send<SearchPost[]>(
      "/search/posts",
      { query: { q, page: page - 1, size: POST_PAGE_SIZE } },
    );
    return {
      ...empty,
      posts: result,
      totalCount: totalCount ?? result.length,
      searched: true,
      fieldErrors: [] as ApiFieldError[],
    };
  } catch (error) {
    if (isApiError(error) && error.status === 400 && error.fieldErrors.length > 0) {
      return { ...empty, searched: false, fieldErrors: error.fieldErrors };
    }
    return throwApiErrorResponse(error);
  }
}

/** 사람마다 검색어가 다른 화면이라 검색 엔진에 넣지 않는다(contracts/routes.md). */
export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  const title = loaderData?.q
    ? t("discovery:search.metaTitle", { q: loaderData.q })
    : t("discovery:search.title");
  return privatePageMeta(title, t("appName"));
}

export default function SearchPage() {
  const { t } = useTranslation();
  const { q, page, pageSize, posts, totalCount, searched, fieldErrors } =
    useLoaderData<typeof loader>();
  const errors = fieldErrorMessages(t, fieldErrors);
  return (
    <main className="search">
      <h1>{t("discovery:search.title")}</h1>
      <Form method="get" action="/search" role="search">
        <FormField
          key={q}
          label={t("discovery:search.label")}
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          error={errors.q}
          hint={t("discovery:search.hint")}
        />
        <button type="submit">{t("discovery:search.submit")}</button>
      </Form>
      {searched && (
        <section aria-label={t("discovery:search.resultsLabel")}>
          <p>{t("discovery:search.count", { count: totalCount })}</p>
          <PostList posts={posts} tagScope="global" emptyText={t("discovery:search.empty")} />
          <Pagination
            page={page}
            totalCount={totalCount}
            pageSize={pageSize}
            hrefFor={(target) => searchHref(q, target)}
          />
        </section>
      )}
    </main>
  );
}
