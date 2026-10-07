import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigate,
  useNavigation,
} from "react-router";

import { api } from "~/api/client";
import { createApiClient } from "~/api/client.server";
import { errorMessage, fieldErrorMessage } from "~/api/errorMessage";
import { apiErrorResponse, isApiError } from "~/api/errors";
import {
  VALIDATION_FAILED,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import type {
  Blog,
  CategoryNode,
  DraftContent,
  LatestDraft,
  PostDetail,
  PostStatus,
  SavedDraft,
  TopicNode,
  TrackbackPing,
  Visibility,
} from "~/api/models";
import { rememberLastBlog } from "~/auth/lastBlog.server";
import { requireUser } from "~/auth/session.server";
import { parsePostId } from "~/blog/ids";
import { Editor, type EditorHandle } from "~/components/Editor/Editor";
import { FormAlert } from "~/components/form/FormField";
import {
  PublishSettingsDialog,
  type PublishSettingsValue,
} from "~/components/post/PublishSettingsDialog";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { useTimeZone } from "~/i18n/zonedDateTime";
import { mediaKeyOf, mediaKeysIn } from "~/media/thumbnail";
import { uploadMedia } from "~/media/upload";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/write";

/** 자동저장 주기(FR-016): 1분 */
export const AUTOSAVE_INTERVAL_MS = 60_000;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("editor:newTitle"), t("appName"));
}

const notFound = () => data(null, { status: 404 });

/** 주인이 아닌 글(403)도 존재를 드러내지 않고 404로 보여준다(contracts/routes.md). */
function toNotFound(error: unknown): never {
  if (isApiError(error)) {
    throw error.status === 403 ? notFound() : apiErrorResponse(error);
  }
  throw error;
}

/**
 * 글쓰기(`/:handle/write`)와 글 수정(`/:handle/write/:postId`). 로그인한 주인만 쓰고, 내 블로그가 아니거나
 * `:handle` 블로그의 글이 아니면 404. 연 블로그를 쿠키 `last_blog`로 기억한다(`/write` 진입점).
 * 화면은 SSR하되 에디터는 브라우저에서만 불러온다(R7).
 * 003: 포털 주제 트리(`/topics`)를 함께 읽고(실패하면 주제 고르기만 비운다), 새 글은 블로그 기본 주제를 미리 고른다
 * (backend는 자동으로 채우지 않으므로 첫 사본 저장에 넣는다, 결정 표 12번).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { handle } = params;
  if (!user.blogs.some((blog) => blog.handle === handle)) {
    throw notFound();
  }
  rememberLastBlog(request, handle);
  const backend = createApiClient(request);

  const topicsRequest = backend.get<TopicNode[]>("/topics").catch(() => [] as TopicNode[]);

  if (params.postId === undefined) {
    const [latestDraft, categories, blog, topics] = await Promise.all([
      backend.get<LatestDraft | null>(`/blogs/${handle}/posts/drafts/latest`),
      backend.get<CategoryNode[]>(`/blogs/${handle}/categories`),
      backend.get<Blog>(`/blogs/${handle}`).catch(() => null),
      topicsRequest,
    ]).catch(toNotFound);
    return {
      handle,
      post: null,
      draft: null,
      latestDraft,
      categories,
      topics,
      defaultTopicId: blog?.defaultTopicId ?? null,
    };
  }

  const postId = parsePostId(params.postId);
  if (postId === null) {
    throw notFound();
  }
  const [post, draft, categories, topics, pings] = await Promise.all([
    backend.get<PostDetail>(`/posts/${postId}`),
    backend.get<DraftContent>(`/posts/${postId}/draft`),
    backend.get<CategoryNode[]>(`/blogs/${handle}/categories`),
    topicsRequest,
    // 005 보낸 트랙백 결과. 읽지 못하면 안내만 보인다.
    backend.get<TrackbackPing[]>(`/posts/${postId}/trackback-pings`).catch(() => null),
  ]).catch(toNotFound);
  if (post.blogHandle !== handle) {
    throw notFound();
  }
  return {
    handle,
    post: {
      id: post.id,
      status: post.status,
      visibility: post.visibility,
      commentEnabled: post.commentEnabled,
      thumbnailUrl: post.thumbnailUrl,
      notice: post.notice ?? false,
      scheduledAt: post.scheduledAt ?? null,
    },
    draft: {
      title: draft.title,
      contentMarkdown: draft.contentMarkdown,
      categoryId: draft.categoryId ?? null,
      tags: draft.tags ?? [],
      topicId: draft.topicId ?? null,
      savedAt: draft.savedAt,
    },
    latestDraft: null,
    categories,
    topics,
    defaultTopicId: null,
    pings,
  };
}

type WriteActionData = FormErrorData & { intent: string; ok: false };

/**
 * 예약 취소(`intent=unschedule` → `POST /posts/{id}/unschedule`, 004 FR-064). 글은 임시저장(DRAFT)으로 돌아가고
 * 같은 작성 화면을 다시 연다. 주인이 아니면 loader와 같이 404.
 */
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { handle } = params;
  const postId = parsePostId(params.postId);
  if (!user.blogs.some((blog) => blog.handle === handle) || postId === null) {
    throw notFound();
  }
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent !== "unschedule") {
    return data<WriteActionData>(
      { intent, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors: [] },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).post(`/posts/${postId}/unschedule`);
  } catch (error) {
    if (isApiError(error) && (error.status === 403 || error.status === 404)) {
      throw notFound();
    }
    const { data: formError, status } = toFormError(error);
    return data<WriteActionData>({ ...formError, intent, ok: false }, { status });
  }
  throw redirect(`/${handle}/write/${postId}`);
}

interface WriteData {
  handle: string;
  post: {
    id: number;
    status: PostStatus;
    visibility: Visibility;
    commentEnabled: boolean;
    thumbnailUrl: string | null;
    notice?: boolean;
    /** 예약 글의 예약 시각(004) */
    scheduledAt?: string | null;
  } | null;
  draft: {
    title: string;
    contentMarkdown: string;
    categoryId: number | null;
    tags: string[];
    topicId: number | null;
    savedAt: string | null;
  } | null;
  latestDraft: LatestDraft | null;
  categories: CategoryNode[];
  topics: TopicNode[];
  /** 새 글에 미리 고를 블로그 기본 주제 */
  defaultTopicId: number | null;
  /** 이미 있는 글이 보낸 트랙백(005). 새 글이면 없음, 읽지 못했으면 null */
  pings?: TrackbackPing[] | null;
}

export default function WritePage() {
  const data = useLoaderData<typeof loader>() as WriteData;
  // 새 글 → 이어 쓰기처럼 다른 글로 옮기면 작성 상태를 새로 만든다.
  return <Writer key={`${data.handle}/${data.post?.id ?? "new"}`} {...data} />;
}

/** 작성 화면의 현재 내용. 자동저장 타이머가 최신 값을 읽도록 ref에 둔다. */
interface DraftState {
  postId: number | null;
  title: string;
  content: string;
  categoryId: number | null;
  tags: string[];
  topicId: number | null;
  dirty: boolean;
}

function Writer({
  handle,
  post,
  draft,
  latestDraft,
  categories,
  topics,
  defaultTopicId,
  pings,
}: WriteData) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const timeZone = useTimeZone();
  const navigate = useNavigate();

  const [title, setTitle] = useState(draft?.title ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(draft?.savedAt ?? null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [askResume, setAskResume] = useState(latestDraft !== null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** 발행 설정을 열 때 본문에 있던 이미지(대표 이미지 후보) */
  const [publishImages, setPublishImages] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const initialTopicId = draft ? draft.topicId : defaultTopicId;
  const [classification, setClassification] = useState({
    categoryId: draft?.categoryId ?? null,
    tags: draft?.tags ?? [],
    topicId: initialTopicId,
  });

  const state = useRef<DraftState>({
    postId: post?.id ?? null,
    title: draft?.title ?? "",
    content: draft?.contentMarkdown ?? "",
    categoryId: draft?.categoryId ?? null,
    tags: draft?.tags ?? [],
    topicId: initialTopicId,
    dirty: false,
  });
  /** 저장은 한 번에 하나씩(새 글이 두 번 만들어지지 않게) */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const editorRef = useRef<EditorHandle>(null);

  const markDirty = () => {
    state.current.dirty = true;
    setDirty(true);
  };

  const runSave = useCallback(
    async (force: boolean): Promise<number | null> => {
      const current = state.current;
      // 에디터의 입력 알림은 늦게 올 수 있으므로 저장 직전에 지금 내용을 직접 읽는다.
      const latest = editorRef.current?.getMarkdown() ?? null;
      if (latest !== null && latest !== current.content) {
        current.content = latest;
        current.dirty = true;
        setDirty(true);
      }
      if (!force && !current.dirty) {
        return current.postId;
      }
      if (!force && current.postId === null && !current.title.trim() && !current.content.trim()) {
        return null;
      }
      // 카테고리·태그·주제는 사본에 그대로 저장하고 검사는 발행할 때 한다(contracts/api.md DraftWrite, 003 research P9).
      const snapshot = {
        title: current.title,
        contentMarkdown: current.content,
        categoryId: current.categoryId,
        tags: current.tags,
        topicId: current.topicId,
      };
      setSaving(true);
      try {
        const saved =
          current.postId === null
            ? await api.post<SavedDraft>(`/blogs/${handle}/posts/drafts`, { body: snapshot })
            : await api.put<SavedDraft>(`/posts/${current.postId}/draft`, { body: snapshot });
        current.postId = saved.id;
        if (current.title === snapshot.title && current.content === snapshot.contentMarkdown) {
          current.dirty = false;
          setDirty(false);
        }
        setSavedAt(saved.savedAt);
        setSaveError(null);
        return saved.id;
      } catch (error) {
        setSaveError(errorMessage(t, isApiError(error) ? error : null));
        throw error;
      } finally {
        setSaving(false);
      }
    },
    [handle, t],
  );

  /** 앞선 저장이 끝난 뒤 저장한다. force면 바뀐 것이 없어도 저장한다(발행 직전). */
  const save = useCallback(
    (force: boolean): Promise<number | null> => {
      const next = queue.current.then(
        () => runSave(force),
        () => runSave(force),
      );
      queue.current = next.catch(() => undefined);
      return next;
    },
    [runSave],
  );

  // 1분마다 바뀐 내용이 있으면 임시저장(FR-016). 실패는 화면에 알리고 다음 주기에 다시 시도한다.
  useEffect(() => {
    const timer = setInterval(() => {
      void save(false).catch(() => undefined);
    }, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [save]);

  /**
   * 에디터에 붙여넣거나 끌어놓은 이미지를 올리고 본문에 넣을 주소(`/media/{key}`)를 돌려준다.
   * 실패하면 이유(용량·형식·임시 용량 한도)를 알리고, 에디터는 이미지를 넣지 않는다.
   */
  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      setUploadError(null);
      try {
        return (await uploadMedia(file, "POST")).url;
      } catch (error) {
        // 005 업로드 속도 한도(1분 30개)는 "잠시 후 다시 올려 주세요"
        setUploadError(
          isApiError(error) && error.resultCode === "TOO_MANY_REQUESTS"
            ? t("media:upload.tooMany")
            : errorMessage(t, isApiError(error) ? error : null),
        );
        throw error;
      }
    },
    [t],
  );

  const openPublish = () => {
    setPublishImages(mediaKeysIn(editorRef.current?.getMarkdown() ?? state.current.content));
    setPublishOpen(true);
  };

  const closePublish = useCallback(() => {
    setPublishOpen(false);
    setPublishError(null);
  }, []);

  async function publish(settings: PublishSettingsValue) {
    setPublishing(true);
    setPublishError(null);
    try {
      // 발행은 작성 중 사본을 발행본으로 옮긴다. 고른 카테고리·태그를 담아 지금 내용을 먼저 저장한다.
      state.current.categoryId = settings.categoryId;
      state.current.tags = settings.tags;
      state.current.topicId = settings.topicId;
      const id = await save(true);
      const published = await api.post<PostDetail>(`/posts/${id}/publish`, {
        body: {
          visibility: settings.visibility,
          commentEnabled: settings.commentEnabled,
          categoryId: settings.categoryId,
          tags: settings.tags,
          topicId: settings.topicId,
          thumbnailMediaKey: settings.thumbnailMediaKey,
          notice: settings.notice,
          ...(settings.password === undefined ? {} : { password: settings.password }),
          scheduledAt: settings.scheduledAt,
          ...(settings.trackbackUrls ? { trackbackUrls: settings.trackbackUrls } : {}),
        },
      });
      // 예약한 글은 아직 공개 주소가 없으므로 예약 글 목록으로 간다.
      navigate(
        published.status === "SCHEDULED"
          ? `/${handle}/manage/posts?status=SCHEDULED`
          : `/${handle}/${published.id}`,
      );
    } catch (error) {
      setPublishError(publishErrorMessage(error));
      setPublishing(false);
    }
  }

  function fieldLabel(field: string): string | null {
    if (field === "title") {
      return t("editor:titleLabel");
    }
    if (field === "topicId") {
      return t("post:topic.label");
    }
    if (field.startsWith("trackbackUrls")) {
      return t("trackback:send.label");
    }
    return field.startsWith("tags") ? t("tag:input.label") : null;
  }

  function publishErrorMessage(error: unknown): string {
    if (isApiError(error) && error.fieldErrors.length > 0) {
      return error.fieldErrors
        .map((fieldError) => {
          const label = fieldLabel(fieldError.field);
          // 005: 트랙백 주소 개수 초과는 글자 수가 아니라 개수로 알린다
          const message =
            fieldError.field === "trackbackUrls" && fieldError.code === "TOO_LONG"
              ? t("trackback:send.tooMany", { max: fieldError.params?.max ?? "" })
              : fieldErrorMessage(t, fieldError);
          return label ? `${label}: ${message}` : message;
        })
        .join(" ");
    }
    return errorMessage(t, isApiError(error) ? error : null);
  }

  let saveStatus: string | null = null;
  if (saving) {
    saveStatus = t("editor:saving");
  } else if (dirty) {
    saveStatus = t("editor:unsaved");
  } else if (savedAt) {
    saveStatus = t("editor:savedAt", { time: format.dateTime(savedAt) });
  }

  return (
    <main className="write">
      <h1>{post ? t("editor:editTitle") : t("editor:newTitle")}</h1>
      {askResume && latestDraft && (
        <div role="alertdialog" aria-labelledby="resume-message" className="resume-draft">
          <p id="resume-message">
            {t("editor:resume.message", {
              title: latestDraft.title || t("editor:resume.untitled"),
              time: format.dateTime(latestDraft.savedAt),
            })}
          </p>
          <Link to={`/${handle}/write/${latestDraft.id}`}>{t("editor:resume.continue")}</Link>{" "}
          <button type="button" onClick={() => setAskResume(false)}>
            {t("editor:resume.discard")}
          </button>
        </div>
      )}
      {post?.status === "SCHEDULED" && <ScheduledNotice scheduledAt={post.scheduledAt ?? null} />}
      <div className="write-title">
        <label htmlFor="post-title">{t("editor:titleLabel")}</label>
        <input
          id="post-title"
          value={title}
          maxLength={200}
          placeholder={t("editor:titlePlaceholder")}
          onChange={(event) => {
            setTitle(event.target.value);
            state.current.title = event.target.value;
            markDirty();
          }}
        />
      </div>
      <Editor
        ref={editorRef}
        value={draft?.contentMarkdown ?? ""}
        label={t("editor:bodyLabel")}
        onUploadImage={uploadImage}
        onChange={(markdown) => {
          if (markdown !== state.current.content) {
            state.current.content = markdown;
            markDirty();
          }
        }}
      />
      {uploadError && (
        <p role="alert" className="form-alert">
          {uploadError}
        </p>
      )}
      <div className="write-actions">
        <p aria-live="polite" className="save-status">
          {saveStatus}
        </p>
        {saveError && (
          <p role="alert" className="form-alert">
            {saveError}
          </p>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            void save(true).catch(() => undefined);
          }}
        >
          {t("editor:saveDraft")}
        </button>
        {/* "완료"는 화면 전환일 뿐 API를 부르지 않는다(contracts/api.md 글쓰기 순서). */}
        <button type="button" onClick={openPublish}>
          {t("editor:complete")}
        </button>
      </div>
      {publishOpen && (
        <PublishSettingsDialog
          published={post?.status === "PUBLISHED"}
          initial={{
            visibility: post?.visibility ?? "PUBLIC",
            commentEnabled: post?.commentEnabled ?? true,
            categoryId: classification.categoryId,
            tags: classification.tags,
            topicId: classification.topicId,
            thumbnailMediaKey: mediaKeyOf(post?.thumbnailUrl),
            notice: post?.notice ?? false,
            scheduledAt: post?.status === "SCHEDULED" ? (post.scheduledAt ?? null) : null,
          }}
          timeZone={timeZone}
          images={publishImages}
          categories={categories}
          topics={topics}
          onClassify={(value) => {
            state.current.categoryId = value.categoryId;
            state.current.tags = value.tags;
            state.current.topicId = value.topicId;
            setClassification(value);
            markDirty();
          }}
          pending={publishing}
          error={publishError}
          pings={post ? pings : undefined}
          onClose={closePublish}
          onPublish={(settings) => void publish(settings)}
        />
      )}
    </main>
  );
}

/** 예약 글 안내와 "예약 취소"(JS 없이도 동작하는 폼, `intent=unschedule`) */
function ScheduledNotice({ scheduledAt }: { scheduledAt: string | null }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const result = useActionData<WriteActionData>();
  const messages = useFormMessages(result && !result.ok ? result : null);
  const submitting = useNavigation().state === "submitting";
  return (
    <div className="scheduled-notice" role="note">
      <p>{t("post:scheduled.notice", { time: format.dateTime(scheduledAt) })}</p>
      <FormAlert message={messages.form} />
      <Form method="post">
        <input type="hidden" name="intent" value="unschedule" />
        <button type="submit" disabled={submitting}>
          {t("post:scheduled.cancel")}
        </button>
      </Form>
    </div>
  );
}
