import { useTranslation } from "react-i18next";
import { data, Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, BlogTag } from "~/api/models";
import { isValidHandle } from "~/blog/ids";
import { TagCloud } from "~/components/blog/TagCloud";
import { publicOrigin } from "~/config.server";
import { metaT } from "~/i18n/meta";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-tags";

/** 블로그 태그 목록(`/:handle/tags`, SSR, 004 FR-061): 이름순, 글이 많은 태그일수록 크게(5단계) */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const api = createApiClient(request);
  const [blog, tags] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.get<BlogTag[]>(`/blogs/${handle}/tags`),
  ]).catch(throwApiErrorResponse);
  return {
    blog: { handle: blog.handle, title: blog.title, description: blog.description },
    tags,
    origin: publicOrigin(request),
  };
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const { blog, origin } = loaderData;
  return pageMeta({
    title: `${t("blog:tags.title")} - ${blog.title}`,
    description: blog.description,
    url: absoluteUrl(origin, `/${blog.handle}/tags`),
    siteName: t("appName"),
  });
}

export default function BlogTags() {
  const { t } = useTranslation();
  const { blog, tags } = useLoaderData<typeof loader>();
  return (
    <main className="blog-tags">
      <header>
        <p>
          <Link to={`/${blog.handle}`}>{blog.title}</Link>
        </p>
        <h1>{t("blog:tags.title")}</h1>
      </header>
      {tags.length === 0 ? (
        <p>{t("blog:tags.empty")}</p>
      ) : (
        <TagCloud handle={blog.handle} tags={tags} sortByName />
      )}
    </main>
  );
}
