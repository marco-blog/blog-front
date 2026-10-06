import { useTranslation } from "react-i18next";
import { Link, data, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, PostSummary } from "~/api/models";
import { isValidHandle, parsePostId } from "~/blog/ids";
import { parsePage, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { CategoryTree, categoryHref, findCategory } from "~/components/blog/CategoryTree";
import { PostList } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-category";

/**
 * 카테고리별 글(`/:handle/category/:categoryId`, SSR). 상위 카테고리는 하위 카테고리 글도 함께 보여준다.
 * 이 블로그의 카테고리가 아니면(없거나 다른 블로그 것) HTTP 404.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  const categoryId = parsePostId(params.categoryId);
  if (!isValidHandle(handle) || categoryId === null) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, posts] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<PostSummary[]>(`/blogs/${handle}/posts`, {
      query: { category: categoryId, page: page - 1 },
    }),
  ]).catch(throwApiErrorResponse);
  const category = findCategory(blog.categories, categoryId);
  if (!category) {
    throw data(null, { status: 404 });
  }
  return {
    blog,
    category: { id: category.id, name: category.name, children: category.children },
    posts: posts.result,
    totalCount: posts.totalCount ?? posts.result.length,
    page,
    pageSize: POST_PAGE_SIZE,
    origin: publicOrigin(request),
  };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const { blog, category, page, origin } = loaderData;
  return pageMeta({
    title: `${category.name} - ${blog.title}`,
    description: blog.description,
    image: absoluteUrl(origin, blog.coverImageUrl),
    url: absoluteUrl(origin, withPage(categoryHref(blog.handle, category.id), page)),
    siteName: t("appName"),
  });
}

export default function BlogCategory() {
  const { t } = useTranslation();
  const { blog, category, posts, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  return (
    <main className="blog-category">
      <header>
        <p>
          <Link to={`/${blog.handle}`}>{blog.title}</Link>
        </p>
        <h1>{category.name}</h1>
        {category.children.length > 0 && (
          <nav aria-label={t("category:page.children")}>
            <ul>
              {category.children.map((child) => (
                <li key={child.id}>
                  <Link to={categoryHref(blog.handle, child.id)}>
                    {child.name} ({child.postCount})
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <CategoryTree handle={blog.handle} categories={blog.categories} currentId={category.id} />
      <PostList handle={blog.handle} posts={posts} emptyText={t("category:page.empty")} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => withPage(categoryHref(blog.handle, category.id), target)}
      />
    </main>
  );
}
