import highlightStyles from "highlight.js/styles/github.css?url";
import { useTranslation } from "react-i18next";
import {
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useRouteLoaderData,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import { VALIDATION_FAILED, toFormError } from "~/api/formErrors";
import type { Blog, Comment, PostDetail, PostSummary, TopicNode, Trackback } from "~/api/models";
import { loginPath } from "~/auth/paths";
import { isValidHandle, parsePostId } from "~/blog/ids";
import { parsePage } from "~/blog/listing";
import { captchaView } from "~/components/captcha/captcha.server";
import { CaptchaContext } from "~/components/captcha/CaptchaContext";
import { categoryHref } from "~/components/blog/CategoryTree";
import type { CommentActionData } from "~/components/comment/actions";
import { runCommentAction } from "~/components/comment/actions.server";
import { CommentSection } from "~/components/comment/CommentSection";
import { REPORT_INTENT, type ReportActionData } from "~/components/report/actions";
import { runReportAction } from "~/components/report/actions.server";
import { ReportButton } from "~/components/report/ReportButton";
import { Avatar } from "~/components/media/Avatar";
import { LikeButton } from "~/components/post/LikeButton";
import { LockedPost, type UnlockActionData } from "~/components/post/LockedPost";
import { PostContent } from "~/components/post/PostContent";
import { ReadCompleteTracker } from "~/components/post/ReadCompleteTracker";
import { blogTagHref } from "~/components/post/PostList";
import { RelatedPosts } from "~/components/post/RelatedPosts";
import { ShareButtons } from "~/components/post/ShareButtons";
import { TrackbackRdf } from "~/components/trackback/TrackbackRdf";
import { TrackbackSection } from "~/components/trackback/TrackbackSection";
import { publicOrigin } from "~/config.server";
import { highlightCodeBlocks } from "~/content/highlight.server";
import { formIntent, isLikeIntent, type LikeActionData } from "~/discovery/actions";
import { runLikeAction } from "~/discovery/actions.server";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { ogImageUrl } from "~/media/thumbnail";
import { findTopicById, topicHref, topicName } from "~/portal/topics";
import type { RootData } from "~/root";
import { blogFeedLinks } from "~/seo/feedLinks";
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
 * 002: 관련 글(`GET /posts/{id}/related`, 실패하면 `[]`)과 피드 자동 발견 링크 제목에 쓸 블로그 제목(`GET /blogs/{handle}`,
 * 실패하면 블로그 주소)도 함께 읽는다.
 * 003: 글에 주제가 있으면 주제 트리(`GET /topics`)로 주제 페이지 링크를 만든다. 트리를 읽지 못하거나 숨긴 주제면 링크를 뺀다.
 * 004: 열지 않은 보호 글(`locked`)은 댓글을 읽지 않고 조회수도 기록하지 않는다(열면 쿠키로 다시 읽는다).
 * 005: 받은 트랙백(`GET /posts/{id}/trackbacks?page=`, 한 쪽 10개, `?tbPage=`)을 댓글과 함께 읽고(실패하면 목록 대신 안내),
 * 비회원 쓰기를 허용한 블로그면 비회원 댓글 폼에 그릴 CAPTCHA 정보도 읽는다.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const postId = parsePostId(params.postId);
  if (!isValidHandle(params.handle) || postId === null) {
    throw data(null, { status: 404 });
  }
  const api = createApiClient(request);
  const [post, related, blog, topics] = await Promise.all([
    api.get<PostDetail>(`/posts/${postId}`).catch(throwApiErrorResponse),
    api.get<PostSummary[]>(`/posts/${postId}/related`).catch((): PostSummary[] => []),
    api.get<Blog>(`/blogs/${params.handle}`).catch(() => null),
    api.get<TopicNode[]>("/topics").catch((): TopicNode[] => []),
  ]);
  if (post.blogHandle !== params.handle) {
    throw data(null, { status: 404 });
  }
  const locked = post.locked === true;
  const tbPage = parsePage(new URL(request.url).searchParams.get("tbPage"));
  const guestWriteEnabled = blog?.guestWriteEnabled ?? false;
  // 조회수 기록(FR-020)은 댓글과 함께. 중복 판단은 backend가 한다. 실패해도 글은 보여준다.
  const [comments, , trackbacks, captcha] = locked
    ? [null, null, null, null]
    : await Promise.all([
        api.get<Comment[]>(`/posts/${postId}/comments`).catch(() => null),
        api.post(`/posts/${postId}/views`).catch(() => null),
        api
          .send<Trackback[]>(`/posts/${postId}/trackbacks`, {
            query: { page: tbPage - 1, size: TRACKBACK_PAGE_SIZE },
          })
          .catch(() => null),
        guestWriteEnabled ? captchaView(request, context) : null,
      ]);

  const { contentMarkdown, ...rest } = post;
  return {
    post: {
      ...rest,
      contentHtml: post.contentHtml ? highlightCodeBlocks(post.contentHtml) : "",
    },
    // contentMarkdown은 주인에게만 온다(contracts/api.md). 원문은 화면에 넘기지 않는다.
    isOwner: contentMarkdown !== null,
    origin: publicOrigin(request),
    comments,
    related,
    blogTitle: blog?.title ?? post.blogHandle,
    guestWriteEnabled,
    captcha,
    trackbacks: trackbacks?.result ?? null,
    trackbackTotal: trackbacks ? (trackbacks.totalCount ?? trackbacks.result.length) : 0,
    tbPage,
    topic: topicLink(topics, post.topicId),
  };
}

/** 글 상세 트랙백 한 쪽의 수(005 contracts/routes.md "최신 10개") */
export const TRACKBACK_PAGE_SIZE = 10;

/** 트랙백 목록의 다른 쪽(`?tbPage=`, 첫 쪽은 쿼리 없음) */
export function trackbackPageHref(handle: string, postId: number, page: number): string {
  const path = `/${handle}/${postId}`;
  return `${page <= 1 ? path : `${path}?tbPage=${page}`}#trackbacks`;
}

/** 글 주제의 링크 정보(소분류만). 트리에 없으면 null. */
function topicLink(topics: TopicNode[], topicId: number | null | undefined) {
  const found = findTopicById(topics, topicId);
  if (!found || found.parent === null) {
    return null;
  }
  return { href: topicHref(found), names: found.topic.names };
}

/**
 * 좋아요(`intent=like|unlike`, 002)와 댓글 쓰기·답글·수정·삭제(US3), 보호 글 열기(`intent=unlock`, 004).
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
  if (intent === "unlock") {
    return runUnlockAction(request, postId, returnTo);
  }
  if (intent === REPORT_INTENT) {
    return runReportAction(request, { returnTo });
  }
  return runCommentAction(request, { postId, returnTo });
}

/**
 * 보호 글 열기: `POST /posts/{id}/unlock`이 준 열람 쿠키(`Set-Cookie`)를 브라우저에 그대로 싣고 같은 주소로 다시 연다.
 * 틀린 비밀번호는 입력란 오류, 막혔으면(429) 남은 분을 알린다.
 */
async function runUnlockAction(request: Request, postId: number, returnTo: string) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  if (password === "") {
    return data<UnlockActionData>(
      {
        intent: "unlock",
        ok: false,
        resultCode: VALIDATION_FAILED,
        field: null,
        fieldErrors: [{ field: "password", code: "REQUIRED" }],
      },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).post(`/posts/${postId}/unlock`, { body: { password } });
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      throw data(null, { status: 404 });
    }
    const { data: formError, status } = toFormError(error, { POST_PASSWORD_MISMATCH: "password" });
    return data<UnlockActionData>({ ...formError, intent: "unlock", ok: false }, { status });
  }
  throw redirect(returnTo);
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
  const { post, origin, blogTitle } = loaderData;
  if (post.locked) {
    // 열지 않은 보호 글: 제목만(요약·대표 이미지 없음), 검색에 넣지 않는다(004 contracts/routes.md).
    return [
      ...pageMeta({
        title: post.title,
        url: absoluteUrl(origin, `/${post.blogHandle}/${post.id}`),
        type: "article",
        siteName: t("appName"),
        noindex: true,
      }),
      ...blogFeedLinks(t, origin, { handle: post.blogHandle, title: blogTitle }),
    ];
  }
  return [
    ...pageMeta({
      title: post.title,
      description: post.summary,
      image: absoluteUrl(origin, ogImageUrl(post.thumbnailUrl)),
      url: absoluteUrl(origin, `/${post.blogHandle}/${post.id}`),
      type: "article",
      siteName: t("appName"),
      // 주인만 볼 수 있는 글은 검색에 넣지 않는다.
      noindex: post.status !== "PUBLISHED" || post.visibility !== "PUBLIC",
    }),
    // RSS·Atom 자동 발견(002 FR-048)
    ...blogFeedLinks(t, origin, { handle: post.blogHandle, title: blogTitle }),
  ];
}

export default function PostDetailPage() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const {
    post,
    isOwner,
    comments,
    related,
    origin,
    topic,
    guestWriteEnabled,
    captcha,
    trackbacks,
    trackbackTotal,
    tbPage,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<
    CommentActionData | LikeActionData | UnlockActionData | ReportActionData
  >();
  const rootData = useRouteLoaderData<RootData>("root");
  const viewer = rootData?.user ?? null;
  const likeResult =
    actionData && isLikeIntent(actionData.intent) ? (actionData as LikeActionData) : undefined;
  const unlockResult =
    actionData?.intent === "unlock" ? (actionData as UnlockActionData) : undefined;
  const result =
    actionData &&
    !isLikeIntent(actionData.intent) &&
    actionData.intent !== "unlock" &&
    actionData.intent !== REPORT_INTENT
      ? (actionData as CommentActionData)
      : undefined;
  /** 로그인 회원이 남의 공개된 글을 볼 때 "신고"(005) */
  const reportable = viewer !== null && !isOwner;
  const handle = post.blogHandle;

  if (post.locked) {
    return (
      <main>
        <LockedPost post={post} result={unlockResult} />
      </main>
    );
  }

  return (
    <main>
      <article className="post">
        <header>
          {post.hidden && (
            <p className="moderation-hidden" role="note">
              {t("moderation:hidden.post")}
            </p>
          )}
          <h1>{post.title}</h1>
          {isOwner && (
            <p className="post-status">
              {post.status === "DRAFT" && <span>{t("post:detail.draft")}</span>}{" "}
              {post.status === "SCHEDULED" && (
                <span>
                  {t("post:detail.scheduled", { time: format.dateTime(post.scheduledAt ?? null) })}
                </span>
              )}{" "}
              {post.visibility === "PRIVATE" && <span>{t("post:detail.private")}</span>}{" "}
              {post.visibility === "PROTECTED" && <span>{t("post:detail.protected")}</span>}{" "}
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
            {topic && (
              <>
                <dt>{t("post:detail.topic")}</dt>
                <dd>
                  <Link to={topic.href}>{topicName(topic.names, i18n.language)}</Link>
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
        {/* 003 끝까지 읽음: 본문 끝이 화면에 들어오면 한 번 보낸다(인기 점수) */}
        {post.status === "PUBLISHED" && <ReadCompleteTracker postId={post.id} />}
        {post.status === "PUBLISHED" && (
          <footer className="post-actions">
            <LikeButton
              liked={post.likedByMe === true}
              likeCount={post.likeCount}
              loginHref={viewer ? null : loginPath(`/${handle}/${post.id}`)}
              result={likeResult}
            />
            {post.visibility === "PUBLIC" && (
              <ShareButtons
                url={absoluteUrl(origin, `/${handle}/${post.id}`) ?? `/${handle}/${post.id}`}
                title={post.title}
                summary={post.summary}
                imageUrl={absoluteUrl(origin, ogImageUrl(post.thumbnailUrl))}
                kakaoJsKey={rootData?.kakaoJsKey ?? null}
              />
            )}
            {reportable && <ReportButton type="POST" id={post.id} />}
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
      <RelatedPosts handle={handle} posts={related} />
      {post.status === "PUBLISHED" && (
        <TrackbackSection
          trackbackUrl={post.trackbackUrl}
          trackbacks={trackbacks}
          totalCount={trackbackTotal}
          page={tbPage}
          pageSize={TRACKBACK_PAGE_SIZE}
          hrefFor={(page) => trackbackPageHref(handle, post.id, page)}
          reportable={reportable}
        />
      )}
      {post.trackbackUrl && (
        <TrackbackRdf
          postUrl={absoluteUrl(origin, `/${handle}/${post.id}`) ?? `/${handle}/${post.id}`}
          title={post.title}
          trackbackUrl={post.trackbackUrl}
        />
      )}
      <CaptchaContext value={captcha ?? null}>
        <CommentSection
          comments={comments}
          commentCount={post.commentCount}
          commentEnabled={post.commentEnabled && post.status === "PUBLISHED"}
          isPostOwner={isOwner}
          guestWriteEnabled={guestWriteEnabled}
          loginHref={loginPath(`/${handle}/${post.id}`)}
          result={result}
          reportable={reportable}
        />
      </CaptchaContext>
    </main>
  );
}
