import highlightStyles from "highlight.js/styles/github.css?url";
import { useTranslation } from "react-i18next";
import {
  Link,
  data,
  useActionData,
  useLoaderData,
  useRouteLoaderData,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { Comment, PostDetail } from "~/api/models";
import { loginPath } from "~/auth/paths";
import { isValidHandle, parsePostId } from "~/blog/ids";
import { categoryHref } from "~/components/blog/CategoryTree";
import type { CommentActionData } from "~/components/comment/actions";
import { runCommentAction } from "~/components/comment/actions.server";
import { CommentSection } from "~/components/comment/CommentSection";
import { Avatar } from "~/components/media/Avatar";
import { LikeButton } from "~/components/post/LikeButton";
import { PostContent } from "~/components/post/PostContent";
import { blogTagHref } from "~/components/post/PostList";
import { publicOrigin } from "~/config.server";
import { highlightCodeBlocks } from "~/content/highlight.server";
import { formIntent, isLikeIntent, type LikeActionData } from "~/discovery/actions";
import { runLikeAction } from "~/discovery/actions.server";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { ogImageUrl } from "~/media/thumbnail";
import type { RootData } from "~/root";
import { absoluteUrl, pageMeta, privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/post-detail";

/** 코드 강조 테마(R24). highlight.js 스크립트는 브라우저로 보내지 않는다. */
export function links() {
  return [{ rel: "stylesheet", href: highlightStyles }];
}

/**
 * 글 상세(`/:handle/:postId`, SSR, FR-019·036). React Router는 정규식 경로를 지원하지 않으므로
 * `postId`가 숫자인지 여기서 검사한다(tasks.md "구현 전 결정 사항" 10번).
 * 볼 수 없는 글(비공개·임시저장·삭제, 정지·탈퇴 회원, 삭제된 블로그)은 backend가 404를 주고, 그대로 HTTP 404로 응답한다.
 * 댓글(US3)은 글과 함께 읽고(`GET /posts/{id}/comments`), 댓글을 읽지 못해도 글은 보여준다.
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const postId = parsePostId(params.postId);
  if (!isValidHandle(params.handle) || postId === null) {
    throw data(null, { status: 404 });
  }
  const api = createApiClient(request);
  const [post, comments] = await Promise.all([
    api.get<PostDetail>(`/posts/${postId}`).catch(throwApiErrorResponse),
    api.get<Comment[]>(`/posts/${postId}/comments`).catch(() => null),
  ]);
  if (post.blogHandle !== params.handle) {
    throw data(null, { status: 404 });
  }
  // 조회수 기록(FR-020). 중복 판단은 backend가 한다. 실패해도 글은 보여준다.
  await api.post(`/posts/${postId}/views`).catch(() => null);

  const { contentMarkdown, ...rest } = post;
  return {
    post: { ...rest, contentHtml: highlightCodeBlocks(post.contentHtml) },
    // contentMarkdown은 주인에게만 온다(contracts/api.md). 원문은 화면에 넘기지 않는다.
    isOwner: contentMarkdown !== null,
    origin: publicOrigin(request),
    comments,
  };
}

/**
 * 좋아요(`intent=like|unlike`, 002)와 댓글 쓰기·답글·수정·삭제(US3).
 * 로그인이 필요하면 이 글로 돌아오는 로그인 화면으로 보낸다.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const postId = parsePostId(params.postId);
  if (!isValidHandle(params.handle) || postId === null) {
    throw data(null, { status: 404 });
  }
  const returnTo = `/${params.handle}/${postId}`;
  const intent = await formIntent(request);
  if (isLikeIntent(intent)) {
    return runLikeAction(request, intent, { postId, returnTo });
  }
  return runCommentAction(request, { postId, returnTo });
}

/** 좋아요는 응답의 수로 화면을 고치므로 글을 다시 읽지 않는다(조회수 기록도 다시 하지 않음). */
export function shouldRevalidate({
  formData,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (isLikeIntent(formData?.get("intent"))) {
    return false;
  }
  return defaultShouldRevalidate;
}

export function meta({ loaderData, matches }: Route.MetaArgs) {
  const t = metaT(matches);
  if (!loaderData) {
    return privatePageMeta(t("notFound.title"), t("appName"));
  }
  const { post, origin } = loaderData;
  return pageMeta({
    title: post.title,
    description: post.summary,
    image: absoluteUrl(origin, ogImageUrl(post.thumbnailUrl)),
    url: absoluteUrl(origin, `/${post.blogHandle}/${post.id}`),
    type: "article",
    siteName: t("appName"),
    // 주인만 볼 수 있는 글은 검색에 넣지 않는다.
    noindex: post.status !== "PUBLISHED" || post.visibility !== "PUBLIC",
  });
}

export default function PostDetailPage() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { post, isOwner, comments } = useLoaderData<typeof loader>();
  const actionData = useActionData<CommentActionData | LikeActionData>();
  const viewer = useRouteLoaderData<RootData>("root")?.user ?? null;
  const likeResult =
    actionData && isLikeIntent(actionData.intent) ? (actionData as LikeActionData) : undefined;
  const result =
    actionData && !isLikeIntent(actionData.intent) ? (actionData as CommentActionData) : undefined;
  const handle = post.blogHandle;

  return (
    <main>
      <article className="post">
        <header>
          <h1>{post.title}</h1>
          {isOwner && (
            <p className="post-status">
              {post.status === "DRAFT" && <span>{t("post:detail.draft")}</span>}{" "}
              {post.visibility === "PRIVATE" && <span>{t("post:detail.private")}</span>}{" "}
              <Link to={`/${handle}/write/${post.id}`}>{t("post:detail.edit")}</Link>
            </p>
          )}
          <dl className="post-meta">
            <dt>{t("post:detail.author")}</dt>
            <dd>
              <Avatar url={post.author.profileImageUrl} /> {post.author.nickname}
            </dd>
            {post.publishedAt && (
              <>
                <dt>{t("post:detail.publishedAt")}</dt>
                <dd>
                  <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
                </dd>
              </>
            )}
            {post.category && (
              <>
                <dt>{t("post:detail.category")}</dt>
                <dd>
                  <Link to={categoryHref(post.blogHandle, post.category.id)}>
                    {post.category.name}
                  </Link>
                </dd>
              </>
            )}
            {post.tags.length > 0 && (
              <>
                <dt>{t("post:detail.tags")}</dt>
                <dd>
                  {post.tags.map((tag, index) => (
                    <span key={tag}>
                      {index > 0 && " "}
                      <Link to={blogTagHref(post.blogHandle, tag)}>#{tag}</Link>
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
          <p>{t("post:views", { views: post.viewCount })}</p>
        </header>
        <PostContent html={post.contentHtml} />
        {post.status === "PUBLISHED" && (
          <footer className="post-actions">
            <LikeButton
              liked={post.likedByMe === true}
              likeCount={post.likeCount}
              loginHref={viewer ? null : loginPath(`/${handle}/${post.id}`)}
              result={likeResult}
            />
          </footer>
        )}
      </article>
      {(post.prev || post.next) && (
        <nav aria-label={t("post:detail.navLabel")} className="post-nav">
          {post.prev && (
            <Link to={`/${handle}/${post.prev.id}`} rel="prev">
              {t("post:detail.prev")}: {post.prev.title}
            </Link>
          )}{" "}
          {post.next && (
            <Link to={`/${handle}/${post.next.id}`} rel="next">
              {t("post:detail.next")}: {post.next.title}
            </Link>
          )}
        </nav>
      )}
      <CommentSection
        comments={comments}
        commentCount={post.commentCount}
        commentEnabled={post.commentEnabled && post.status === "PUBLISHED"}
        isPostOwner={isOwner}
        loginHref={loginPath(`/${handle}/${post.id}`)}
        result={result}
      />
    </main>
  );
}
