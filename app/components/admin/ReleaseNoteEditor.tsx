import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import {
  RELEASE_NOTE_LANGS,
  REQUIRED_LANG,
  bodyField,
  titleField,
  type EditorValues,
} from "~/admin/releaseNoteForm";
import type { ReleaseNotePreview } from "~/api/models";

import { LanguageTabs, languageName } from "./LanguageTabs";
import { MarkdownPreview } from "./MarkdownPreview";

export interface ReleaseNoteEditorProps {
  values: EditorValues;
  /** 처음 게시한 뒤에는 버전 읽기 전용(003 `RELEASE_NOTE_VERSION_LOCKED`) */
  versionLocked: boolean;
  /** 수정 화면: 낙관적 잠금 번호(숨은 값) */
  baseRevisionNo?: number;
  /** 입력란 이름 → 오류 문구 */
  fieldMessages: Record<string, string>;
  preview?: { lang: string; result: ReleaseNotePreview } | null;
  submitLabel: string;
}

/**
 * 릴리스 노트 편집기(006 FR-107, T062): 버전, 릴리스 날짜, 언어판 탭(ko 필수, en·ja·zh-CN은 "이 언어판 넣기")별 제목·Markdown 본문,
 * 언어판마다 "미리보기"(`intent=preview:{lang}`, 입력은 그대로), 저장(`intent=save`). 필드 오류는 입력란 옆에 보인다(AS2).
 */
export function ReleaseNoteEditor({
  values,
  versionLocked,
  baseRevisionNo,
  fieldMessages,
  preview,
  submitLabel,
}: ReleaseNoteEditorProps) {
  const { t } = useTranslation();
  const submitting = useNavigation().state === "submitting";
  const error = (field: string) =>
    fieldMessages[field] ? (
      <span className="field-error" id={`${field}-error`}>
        {" "}
        {fieldMessages[field]}
      </span>
    ) : null;
  const invalid = (field: string) => (fieldMessages[field] ? true : undefined);
  const describedBy = (field: string) => (fieldMessages[field] ? `${field}-error` : undefined);
  const openLanguages = RELEASE_NOTE_LANGS.filter(
    (lang) =>
      values.included.includes(lang) ||
      preview?.lang === lang ||
      Object.keys(fieldMessages).some((field) => field.startsWith(`contents.${lang}`)),
  );
  return (
    <Form method="post" className="release-note-editor">
      {baseRevisionNo !== undefined && (
        <input type="hidden" name="baseRevisionNo" value={baseRevisionNo} />
      )}
      <p>
        <label>
          {t("admin:releaseNotes.editor.version")}{" "}
          <input
            type="text"
            name="version"
            defaultValue={values.version}
            readOnly={versionLocked}
            aria-invalid={invalid("version")}
            aria-describedby={describedBy("version")}
          />
        </label>
        {error("version")}{" "}
        <span className="form-hint">
          {t(
            versionLocked
              ? "admin:releaseNotes.editor.versionLocked"
              : "admin:releaseNotes.editor.versionHint",
          )}
        </span>
      </p>
      <p>
        <label>
          {t("admin:releaseNotes.editor.releaseDate")}{" "}
          <input
            type="date"
            name="releaseDate"
            defaultValue={values.releaseDate}
            aria-invalid={invalid("releaseDate")}
            aria-describedby={describedBy("releaseDate")}
          />
        </label>
        {error("releaseDate")}
      </p>
      <LanguageTabs
        languages={RELEASE_NOTE_LANGS}
        openLanguages={openLanguages}
        label={t("admin:releaseNotes.editor.languages")}
      >
        {(lang) => (
          <div className="release-note-language">
            {lang !== REQUIRED_LANG && (
              <p>
                <label>
                  <input
                    type="checkbox"
                    name="include"
                    value={lang}
                    defaultChecked={values.included.includes(lang)}
                  />{" "}
                  {t("admin:releaseNotes.editor.include")} ({languageName(lang)})
                </label>
              </p>
            )}
            {error(`contents.${lang}`)}
            <p>
              <label>
                {t("admin:releaseNotes.editor.noteTitle")} ({languageName(lang)}){" "}
                <input
                  type="text"
                  name={titleField(lang)}
                  defaultValue={values.contents[lang]?.title ?? ""}
                  aria-invalid={invalid(titleField(lang))}
                  aria-describedby={describedBy(titleField(lang))}
                />
              </label>
              {error(titleField(lang))}
            </p>
            <p>
              <label>
                {t("admin:releaseNotes.editor.body")} ({languageName(lang)})
                <textarea
                  name={bodyField(lang)}
                  defaultValue={values.contents[lang]?.contentMarkdown ?? ""}
                  aria-invalid={invalid(bodyField(lang))}
                  aria-describedby={describedBy(bodyField(lang))}
                />
              </label>
              {error(bodyField(lang))}
            </p>
            <p>
              <button type="submit" name="intent" value={`preview:${lang}`} disabled={submitting}>
                {t("admin:releaseNotes.editor.preview")} ({languageName(lang)})
              </button>
            </p>
            {preview?.lang === lang && (
              <MarkdownPreview preview={preview.result} language={languageName(lang)} />
            )}
          </div>
        )}
      </LanguageTabs>
      <p>
        <button type="submit" name="intent" value="save" disabled={submitting}>
          {submitLabel}
        </button>
      </p>
    </Form>
  );
}
