import { useTranslation } from "react-i18next";
import { data, Form, Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { fieldErrorMessages } from "~/api/errorMessage";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import type { Blog, SearchPost } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { isValidHandle } from "~/blog/ids";
import { parsePage, POST_PAGE_SIZE } from "~/blog/listing";
import { FormField } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { PostList } from "~/components/post/PostList";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-search";

/** 블로그 안 검색 주소. 첫 페이지는 `page`를 붙이지 않는다. */
export function blogSearchHref(handle: string, q: string, page = 1): string {
  const params = new URLSearchParams({ q });
  if (page > 1) {
    params.set("page", String(page));
  }
  return `/${handle}/search?${params.toString()}`;
}

/**
 * 블로그 안 검색(`/:handle/search?q=&page=`, SSR, 004 FR-061): 002 전체 검색과 같은 규칙으로 이 블로그 글만 찾는다
 * (`GET /search/posts?blog=`). 검색어가 비면 API를 부르지 않고, 길이 오류(2자 미만·100자 초과)는 입력란 아래 문구.
 * 보호 글은 backend가 제목만 준다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = parsePage(url.searchParams.get("page"));
  const api = createApiClient(request);
  const blog = await api.get<Blog>(`/blogs/${handle}`).catch(throwApiErrorResponse);
  const base = {
    blog: { handle: blog.handle, title: blog.title },
    q,
    page,
    pageSize: POST_PAGE_SIZE,
    posts: [] as SearchPost[],
    totalCount: 0,
    searched: false,
    fieldErrors: [] as ApiFieldError[],
  };
  if (!q) {
    return base;
  }
  try {
    const { result, totalCount } = await api.send<SearchPost[]>("/search/posts", {
      query: { blog: handle, q, page: page - 1, size: POST_PAGE_SIZE },
    });
    return { ...base, posts: result, totalCount: totalCount ?? result.length, searched: true };
  } catch (error) {
    if (isApiError(error) && error.status === 400 && error.fieldErrors.length > 0) {
      return { ...base, fieldErrors: error.fieldErrors };
    }
    return throwApiErrorResponse(error);
  }
}

/** 검색 결과 화면은 검색 엔진에 넣지 않는다. */
export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const title = loaderData.q
    ? t("blog:search.metaTitle", { q: loaderData.q, title: loaderData.blog.title })
    : `${t("blog:search.title")} - ${loaderData.blog.title}`;
  return privatePageMeta(title, t("appName"));
}

export default function BlogSearch() {
  const { t } = useTranslation();
  const { blog, q, page, pageSize, posts, totalCount, searched, fieldErrors } =
    useLoaderData<typeof loader>();
  const errors = fieldErrorMessages(t, fieldErrors);
  return (
    <main className="blog-search">
      <header>
        <p>
          <Link to={`/${blog.handle}`}>{blog.title}</Link>
        </p>
        <h1>{t("blog:search.title")}</h1>
      </header>
      <Form method="get" action={`/${blog.handle}/search`} role="search">
        <FormField
          key={q}
          label={t("blog:search.label")}
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
          error={errors.q}
          hint={t("discovery:search.hint")}
        />
        <button type="submit">{t("blog:search.submit")}</button>
      </Form>
      {searched && (
        <section aria-label={t("discovery:search.resultsLabel")}>
          <p>{t("discovery:search.count", { count: totalCount })}</p>
          <PostList handle={blog.handle} posts={posts} emptyText={t("discovery:search.empty")} />
          <Pagination
            page={page}
            totalCount={totalCount}
            pageSize={pageSize}
            hrefFor={(target) => blogSearchHref(blog.handle, q, target)}
          />
        </section>
      )}
    </main>
  );
}
