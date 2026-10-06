import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, data, useLoaderData, useNavigate } from "react-router";

import { api } from "~/api/client";
import { createApiClient } from "~/api/client.server";
import { errorMessage, fieldErrorMessage } from "~/api/errorMessage";
import { apiErrorResponse, isApiError } from "~/api/errors";
import type {
  DraftContent,
  LatestDraft,
  PostDetail,
  PostStatus,
  SavedDraft,
  Visibility,
} from "~/api/models";
import { rememberLastBlog } from "~/auth/lastBlog.server";
import { requireUser } from "~/auth/session.server";
import { parsePostId } from "~/blog/ids";
import { Editor, type EditorHandle } from "~/components/Editor/Editor";
import {
  PublishSettingsDialog,
  type PublishSettingsValue,
} from "~/components/post/PublishSettingsDialog";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
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
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { handle } = params;
  if (!user.blogs.some((blog) => blog.handle === handle)) {
    throw notFound();
  }
  rememberLastBlog(request, handle);
  const backend = createApiClient(request);

  if (params.postId === undefined) {
    const latestDraft = await backend
      .get<LatestDraft | null>(`/blogs/${handle}/posts/drafts/latest`)
      .catch(toNotFound);
    return { handle, post: null, draft: null, latestDraft };
  }

  const postId = parsePostId(params.postId);
  if (postId === null) {
    throw notFound();
  }
  const [post, draft] = await Promise.all([
    backend.get<PostDetail>(`/posts/${postId}`),
    backend.get<DraftContent>(`/posts/${postId}/draft`),
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
    },
    draft: { title: draft.title, contentMarkdown: draft.contentMarkdown, savedAt: draft.savedAt },
    latestDraft: null,
  };
}

interface WriteData {
  handle: string;
  post: { id: number; status: PostStatus; visibility: Visibility; commentEnabled: boolean } | null;
  draft: { title: string; contentMarkdown: string; savedAt: string | null } | null;
  latestDraft: LatestDraft | null;
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
  dirty: boolean;
}

function Writer({ handle, post, draft, latestDraft }: WriteData) {
  const { t } = useTranslation();
  const format = useDateFormat();
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

  const state = useRef<DraftState>({
    postId: post?.id ?? null,
    title: draft?.title ?? "",
    content: draft?.contentMarkdown ?? "",
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
      const snapshot = { title: current.title, contentMarkdown: current.content };
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

  const closePublish = useCallback(() => {
    setPublishOpen(false);
    setPublishError(null);
  }, []);

  async function publish(settings: PublishSettingsValue) {
    setPublishing(true);
    setPublishError(null);
    try {
      // 발행은 작성 중 사본을 발행본으로 옮긴다. 지금 내용을 먼저 저장한다.
      const id = await save(true);
      const published = await api.post<PostDetail>(`/posts/${id}/publish`, {
        body: { visibility: settings.visibility, commentEnabled: settings.commentEnabled },
      });
      navigate(`/${handle}/${published.id}`);
    } catch (error) {
      setPublishError(publishErrorMessage(error));
      setPublishing(false);
    }
  }

  function publishErrorMessage(error: unknown): string {
    if (isApiError(error) && error.fieldErrors.length > 0) {
      return error.fieldErrors
        .map((fieldError) => {
          const label = fieldError.field === "title" ? t("editor:titleLabel") : null;
          const message = fieldErrorMessage(t, fieldError);
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
        onChange={(markdown) => {
          if (markdown !== state.current.content) {
            state.current.content = markdown;
            markDirty();
          }
        }}
      />
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
        <button type="button" onClick={() => setPublishOpen(true)}>
          {t("editor:complete")}
        </button>
      </div>
      {publishOpen && (
        <PublishSettingsDialog
          published={post?.status === "PUBLISHED"}
          initial={{
            visibility: post?.visibility ?? "PUBLIC",
            commentEnabled: post?.commentEnabled ?? true,
          }}
          pending={publishing}
          error={publishError}
          onClose={closePublish}
          onPublish={(settings) => void publish(settings)}
        />
      )}
    </main>
  );
}
