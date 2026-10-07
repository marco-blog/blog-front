import { useTranslation } from "react-i18next";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { adminNotFound, isAdminDenied, requireAdmin, throwAdminError } from "~/admin/access.server";
import {
  RELEASE_NOTE_LANGS,
  emptyValues,
  readValues,
  valuesFrom,
  writeBody,
  type EditorValues,
} from "~/admin/releaseNoteForm";
import { createApiClient } from "~/api/client.server";
import { toFormError, useFormMessages, type FormErrorData } from "~/api/formErrors";
import type { AdminReleaseNote, AdminRevision, ReleaseNotePreview } from "~/api/models";
import { ReleaseNoteEditor } from "~/components/admin/ReleaseNoteEditor";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";
import { versionHref } from "~/updates/versionTree";

import type { Route } from "./+types/release-note-edit";
import { RELEASE_NOTES_PATH } from "./release-notes";

const ID_PATTERN = /^\d{1,18}$/;
const CONFLICT = "RELEASE_NOTE_REVISION_CONFLICT";

export const noteHref = (id: number) => `${RELEASE_NOTES_PATH}/${id}`;

export function meta({ matches, loaderData }: Route.MetaArgs) {
  const t = metaT(matches);
  const title = loaderData?.note
    ? t("admin:releaseNotes.editor.editTitle", { version: loaderData.note.version })
    : t("admin:releaseNotes.editor.newTitle");
  return privatePageMeta(title, t("appName"));
}

/** 경로의 노트 번호. `/new`면 null, 숫자가 아니면 404 */
function noteId(params: { id?: string }): number | null {
  if (params.id === undefined) {
    return null;
  }
  if (!ID_PATTERN.test(params.id)) {
    throw adminNotFound();
  }
  return Number(params.id);
}

/**
 * 릴리스 노트 만들기·수정(`/admin/release-notes/new`, `/admin/release-notes/:id`, 006 FR-107, T062). 003 `topic.tsx`처럼 한 모듈을
 * 두 경로에 쓰고 `id`로 구분한다. `?fromRevision=`이 있으면 그 수정본 내용으로 입력을 채우고 `baseRevisionNo`는 지금 번호(저장하면
 * 새 수정본).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  await requireAdmin(request);
  const id = noteId(params);
  if (id === null) {
    return { note: null, values: emptyValues(), fromRevision: null };
  }
  const api = createApiClient(request);
  const note = await api
    .get<AdminReleaseNote>(`${RELEASE_NOTES_PATH}/${id}`)
    .catch(throwAdminError);
  const fromText = new URL(request.url).searchParams.get("fromRevision");
  if (fromText && /^\d{1,9}$/.test(fromText)) {
    const revision = await api
      .get<AdminRevision>(`${RELEASE_NOTES_PATH}/${id}/revisions/${fromText}`)
      .catch(throwAdminError);
    return { note, values: valuesFrom(revision), fromRevision: revision.revisionNo };
  }
  return { note, values: valuesFrom(note), fromRevision: null };
}

/** action 결과: 미리보기, 성공 안내, 오류(입력 유지·충돌 안내) */
export type ReleaseNoteActionData =
  | { intent: "preview"; ok: true; lang: string; preview: ReleaseNotePreview; values: EditorValues }
  | { intent: string; ok: true; values?: undefined }
  | (FormErrorData & { intent: string; ok: false; values: EditorValues | null; conflict: boolean });

function failure(intent: string, error: unknown, values: EditorValues | null) {
  if (isAdminDenied(error)) {
    throw adminNotFound();
  }
  const { data: formError, status } = toFormError(error);
  return data<ReleaseNoteActionData>(
    { ...formError, intent, ok: false, values, conflict: formError.resultCode === CONFLICT },
    { status },
  );
}

/** front가 미리 찾은 입력 오류(400): 확인 체크 없음, 모르는 intent·언어판 */
function invalid(
  intent: string,
  fieldErrors: FormErrorData["fieldErrors"] = [],
  values: EditorValues | null = null,
) {
  return data<ReleaseNoteActionData>(
    {
      intent,
      ok: false,
      values,
      conflict: false,
      resultCode: "VALIDATION_FAILED",
      field: null,
      fieldErrors,
    },
    { status: 400 },
  );
}

/**
 * - `intent=preview:{lang}` → POST /admin/release-notes/preview(그 언어판 본문). 입력은 그대로 돌려준다(JS 없음 경로).
 * - `intent=save` → 새 노트는 POST 후 `/admin/release-notes/{id}`로, 수정은 PUT(`baseRevisionNo`). 409 충돌이면 입력 유지 + 안내.
 * - `intent=publish|unpublish|delete`(+ `confirm`) → POST publish·unpublish, DELETE 후 목록으로.
 */
export async function action({ request, params }: Route.ActionArgs) {
  await requireAdmin(request);
  const id = noteId(params);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const api = createApiClient(request);

  if (intent.startsWith("preview:")) {
    const lang = intent.slice("preview:".length);
    const values = readValues(form);
    if (!RELEASE_NOTE_LANGS.includes(lang)) {
      return invalid("preview", [{ field: "lang", code: "INVALID" }], values);
    }
    try {
      const preview = await api.post<ReleaseNotePreview>(`${RELEASE_NOTES_PATH}/preview`, {
        body: { contentMarkdown: values.contents[lang].contentMarkdown },
      });
      return data<ReleaseNoteActionData>({ intent: "preview", ok: true, lang, preview, values });
    } catch (error) {
      return failure("preview", error, values);
    }
  }

  if (intent === "save") {
    const values = readValues(form);
    try {
      if (id === null) {
        const note = await api.post<AdminReleaseNote>(RELEASE_NOTES_PATH, {
          body: writeBody(values),
        });
        return redirect(noteHref(note.id));
      }
      const base = Number(form.get("baseRevisionNo"));
      await api.put<AdminReleaseNote>(`${RELEASE_NOTES_PATH}/${id}`, {
        body: writeBody(values, Number.isInteger(base) ? base : undefined),
      });
      return data<ReleaseNoteActionData>({ intent, ok: true });
    } catch (error) {
      return failure(intent, error, values);
    }
  }

  if (id !== null && (intent === "publish" || intent === "unpublish" || intent === "delete")) {
    if (!form.get("confirm")) {
      return invalid(intent, [{ field: "confirm", code: "REQUIRED" }]);
    }
    try {
      if (intent === "delete") {
        await api.delete(`${RELEASE_NOTES_PATH}/${id}`);
        return redirect(RELEASE_NOTES_PATH);
      }
      await api.post(`${RELEASE_NOTES_PATH}/${id}/${intent}`);
      return data<ReleaseNoteActionData>({ intent, ok: true });
    } catch (error) {
      return failure(intent, error, null);
    }
  }
  return invalid(intent);
}

/** 게시·게시 중단·삭제 폼 하나(확인 체크 + 버튼) */
function ConfirmForm({
  intent,
  label,
  confirm,
}: {
  intent: string;
  label: string;
  confirm: string;
}) {
  const submitting = useNavigation().state === "submitting";
  return (
    <Form method="post" className="confirm-form">
      <input type="hidden" name="intent" value={intent} />
      <label>
        <input type="checkbox" name="confirm" value="yes" required /> {confirm}
      </label>{" "}
      <button type="submit" disabled={submitting}>
        {label}
      </button>
    </Form>
  );
}

export default function AdminReleaseNoteEdit() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { note, values: loaded, fromRevision } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>() as ReleaseNoteActionData | undefined;
  const failed = result && !result.ok ? result : null;
  const messages = useFormMessages(failed);
  // 미리보기·오류면 보낸 입력을 그대로 다시 채운다(JS 없음). 저장·게시 성공이면 loader의 새 값.
  const values = result?.values ?? loaded;
  const preview =
    result && result.ok && result.intent === "preview" && "preview" in result
      ? { lang: result.lang, result: result.preview }
      : null;
  const editorKey = JSON.stringify([note?.revisionNo ?? 0, values]);
  const title = note
    ? t("admin:releaseNotes.editor.editTitle", { version: note.version })
    : t("admin:releaseNotes.editor.newTitle");
  return (
    <main className="admin-release-note-edit">
      <h1>{title}</h1>
      {fromRevision !== null && (
        <p role="status">{t("admin:releaseNotes.editor.fromRevision", { no: fromRevision })}</p>
      )}
      {result?.ok && result.intent !== "preview" && (
        <p role="status">{t(`admin:releaseNotes.editor.done.${result.intent}`)}</p>
      )}
      {failed && (
        <div role="alert" className="form-alert">
          {failed.conflict && note ? (
            <p>
              {t("admin:releaseNotes.editor.conflict")}{" "}
              <a href={noteHref(note.id)} target="_blank" rel="noopener">
                {t("admin:releaseNotes.editor.openLatest")}
              </a>
            </p>
          ) : (
            messages.form && <p>{messages.form}</p>
          )}
          {messages.fields.confirm && (
            <p>
              {t("admin:fields.confirm")}: {messages.fields.confirm}
            </p>
          )}
        </div>
      )}
      {note && (
        <section aria-labelledby="release-note-info">
          <h2 id="release-note-info">{t("admin:releaseNotes.editor.info")}</h2>
          <ul>
            <li>
              {t("admin:releaseNotes.editor.statusLabel")}:{" "}
              <span className={`badge badge-${note.status.toLowerCase()}`}>
                {t(`admin:releaseNotes.status.${note.status}`)}
              </span>{" "}
              · {t("admin:releaseNotes.editor.revision", { no: note.revisionNo })}
            </li>
            <li>
              {t("admin:releaseNotes.editor.createdBy", {
                nickname: note.createdBy.nickname,
                time: format.dateTime(note.createdAt),
              })}
            </li>
            <li>
              {t("admin:releaseNotes.editor.updatedBy", {
                nickname: note.updatedBy.nickname,
                time: format.dateTime(note.updatedAt),
              })}
            </li>
            {note.firstPublishedAt && (
              <li>
                {t("admin:releaseNotes.editor.firstPublishedAt", {
                  time: format.dateTime(note.firstPublishedAt),
                })}
              </li>
            )}
          </ul>
          <p>
            {note.status === "PUBLISHED" && (
              <>
                <Link to={versionHref(note.version)}>
                  {t("admin:releaseNotes.editor.viewPublic")}
                </Link>{" "}
                ·{" "}
              </>
            )}
            <Link to={`${noteHref(note.id)}/revisions`}>
              {t("admin:releaseNotes.editor.revisions")}
            </Link>{" "}
            ·{" "}
            <Link to={`/admin/audit-log?targetType=RELEASE_NOTE&targetId=${note.id}`}>
              {t("admin:releaseNotes.editor.auditLog")}
            </Link>
          </p>
        </section>
      )}
      <ReleaseNoteEditor
        key={editorKey}
        values={values}
        versionLocked={note?.firstPublishedAt != null}
        baseRevisionNo={note?.revisionNo}
        fieldMessages={messages.fields}
        preview={preview}
        submitLabel={t(
          note ? "admin:releaseNotes.editor.save" : "admin:releaseNotes.editor.saveDraft",
        )}
      />
      {note && (
        <section aria-labelledby="release-note-actions">
          <h2 id="release-note-actions">{t("admin:releaseNotes.editor.actions")}</h2>
          {note.status === "DRAFT" ? (
            <ConfirmForm
              intent="publish"
              label={t("admin:releaseNotes.editor.publish")}
              confirm={t("admin:releaseNotes.editor.confirmPublish")}
            />
          ) : (
            <ConfirmForm
              intent="unpublish"
              label={t("admin:releaseNotes.editor.unpublish")}
              confirm={t("admin:releaseNotes.editor.confirmUnpublish")}
            />
          )}
          {!note.firstPublishedAt && (
            <>
              <p className="form-hint">{t("admin:releaseNotes.editor.deleteHint")}</p>
              <ConfirmForm
                intent="delete"
                label={t("admin:releaseNotes.editor.delete")}
                confirm={t("admin:releaseNotes.editor.confirmDelete")}
              />
            </>
          )}
        </section>
      )}
    </main>
  );
}
