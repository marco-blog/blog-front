import { useTranslation } from "react-i18next";
import {
  data,
  useActionData,
  useLoaderData,
  useRouteLoaderData,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Blog, PostSummary } from "~/api/models";
import { loginPath } from "~/auth/paths";
import { isValidHandle } from "~/blog/ids";
import { parsePage, POST_PAGE_SIZE, withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";
import { NoticeList } from "~/components/blog/NoticeList";
import { SubscribeButton } from "~/components/blog/SubscribeButton";
import { Avatar } from "~/components/media/Avatar";
import { PostList } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { formIntent, isSubscribeIntent, type SubscribeActionData } from "~/discovery/actions";
import { runSubscribeAction } from "~/discovery/actions.server";
import { metaT } from "~/i18n/meta";
import { ogImageUrl, thumbnailImage } from "~/media/thumbnail";
import type { RootData } from "~/root";
import { blogFeedLinks } from "~/seo/feedLinks";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/blog-home";

/** 한 페이지 글 수(FR-011) */
export const PAGE_SIZE = POST_PAGE_SIZE;
/** 블로그 홈 공지 수(004 FR-059) */
export const NOTICE_LIMIT = 5;

function pageHref(handle: string, page: number): string {
  return withPage(`/${handle}`, page);
}

/**
 * 블로그 홈(`/:handle`, SSR). 블로그 정보와 공개 글 목록(최신순 20개, backend 페이지는 0부터)을 서버에서 불러온다.
 * 첫 쪽에는 글 목록 위에 공지(최대 5개)를 보여준다(004, 글 목록 API는 공지를 빼고 준다). 카테고리는 사이드바가 그린다.
 * 없는 블로그·삭제된 블로그·정지된 회원의 블로그는 HTTP 404(FR-159).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const api = createApiClient(request);
  const [blog, posts, notices] = await Promise.all([
    api.get<Blog>(`/blogs/${handle}`),
    api.send<PostSummary[]>(`/blogs/${handle}/posts`, { query: { page: page - 1 } }),
    // 공지는 첫 쪽 글 목록 위에만(최대 5개, 004 FR-059). 읽지 못해도 홈은 보여준다.
    page === 1
      ? api
          .send<PostSummary[]>(`/blogs/${handle}/notices`, { query: { size: NOTICE_LIMIT } })
          .catch(() => null)
      : null,
  ]).catch(throwApiErrorResponse);
  return {
    blog,
    posts: posts.result,
    totalCount: posts.totalCount ?? posts.result.length,
    notices: notices?.result ?? [],
    noticeCount: notices?.totalCount ?? notices?.result.length ?? 0,
    page,
    pageSize: PAGE_SIZE,
    origin: publicOrigin(request),
  };
}

/** 구독·구독 취소(`intent=subscribe|unsubscribe`, 002 FR-031). 로그인이 필요하면 이 블로그로 돌아오는 로그인 화면으로. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = params;
  if (!isValidHandle(handle)) {
    throw data(null, { status: 404 });
  }
  const intent = await formIntent(request);
  if (!isSubscribeIntent(intent)) {
    throw data(null, { status: 400 });
  }
  return runSubscribeAction(request, intent, { handle, returnTo: `/${handle}` });
}

/** 구독은 응답의 수로 화면을 고치므로 블로그·글 목록을 다시 읽지 않는다. */
export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (isSubscribeIntent(formData?.get("intent"))) {
    return false;
  }
  return defaultShouldRevalidate;
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const { blog, page, origin } = loaderData;
  return [
    ...pageMeta({
      title: blog.title,
      description: blog.description,
      image: absoluteUrl(origin, ogImageUrl(blog.coverImageUrl)),
      url: absoluteUrl(origin, pageHref(blog.handle, page)),
      siteName: t("appName"),
    }),
    // RSS·Atom 자동 발견(002 FR-048)
    ...blogFeedLinks(t, origin, blog),
  ];
}

export default function BlogHome() {
  const { t } = useTranslation();
  const { blog, posts, totalCount, notices, noticeCount, page, pageSize } =
    useLoaderData<typeof loader>();
  const result = useActionData<SubscribeActionData>();
  const viewer = useRouteLoaderData<RootData>("root")?.user ?? null;
  return (
    <main className="blog-home">
      <header>
        {blog.coverImageUrl && (
          <img {...thumbnailImage(blog.coverImageUrl, "cover")} alt="" className="blog-cover" />
        )}
        <h1>{blog.title}</h1>
        {blog.description && <p>{blog.description}</p>}
        <p>
          <Avatar url={blog.owner.profileImageUrl} size="avatar" />{" "}
          {t("post:blog.owner", { nickname: blog.owner.nickname })}
        </p>
        <SubscribeButton
          subscribed={blog.subscribedByMe === true}
          subscriberCount={blog.subscriberCount}
          isOwnBlog={viewer?.blogs?.includes(blog.handle) ?? false}
          loginHref={viewer ? null : loginPath(`/${blog.handle}`)}
          result={result}
        />
      </header>
      <NoticeList handle={blog.handle} notices={notices} totalCount={noticeCount} />
      <PostList handle={blog.handle} posts={posts} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => pageHref(blog.handle, target)}
      />
    </main>
  );
}
