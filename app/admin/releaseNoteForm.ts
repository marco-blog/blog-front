import type { ReleaseNoteContentWrite, ReleaseNoteWrite } from "~/api/models";
import { SUPPORTED_LANGUAGES } from "~/i18n/config";

/** 릴리스 노트 언어판(ko 필수, 나머지 선택, 003 FR-157) */
export const RELEASE_NOTE_LANGS: readonly string[] = SUPPORTED_LANGUAGES;
export const REQUIRED_LANG = "ko";

/** 편집기 입력 값(화면 ↔ action). `included`는 넣을 언어판(ko는 늘 포함) */
export interface EditorValues {
  version: string;
  releaseDate: string;
  contents: Record<string, ReleaseNoteContentWrite>;
  included: string[];
}

const blank = (): ReleaseNoteContentWrite => ({ title: "", contentMarkdown: "" });

/** 빈 편집기(새 노트) */
export function emptyValues(): EditorValues {
  return {
    version: "",
    releaseDate: "",
    contents: Object.fromEntries(RELEASE_NOTE_LANGS.map((lang) => [lang, blank()])),
    included: [REQUIRED_LANG],
  };
}

/** 저장된 노트·수정본의 값으로 편집기를 채운다(없는 언어판은 빈 값, 넣지 않음) */
export function valuesFrom(source: {
  version: string | null;
  releaseDate: string | null;
  contents: Record<string, ReleaseNoteContentWrite> | null;
}): EditorValues {
  const contents = source.contents ?? {};
  return {
    version: source.version ?? "",
    releaseDate: source.releaseDate ?? "",
    contents: Object.fromEntries(
      RELEASE_NOTE_LANGS.map((lang) => [lang, contents[lang] ?? blank()]),
    ),
    included: RELEASE_NOTE_LANGS.filter((lang) => lang === REQUIRED_LANG || lang in contents),
  };
}

/** 폼 입력 이름: `contents.{lang}.title`, `contents.{lang}.contentMarkdown`(backend 필드 오류 이름과 같다) */
export const titleField = (lang: string) => `contents.${lang}.title`;
export const bodyField = (lang: string) => `contents.${lang}.contentMarkdown`;

/** 폼 데이터를 편집기 값으로(입력 유지용, 다듬지 않음) */
export function readValues(form: FormData): EditorValues {
  const text = (name: string) => String(form.get(name) ?? "");
  const chosen = form.getAll("include").map(String);
  return {
    version: text("version").trim(),
    releaseDate: text("releaseDate").trim(),
    contents: Object.fromEntries(
      RELEASE_NOTE_LANGS.map((lang) => [
        lang,
        { title: text(titleField(lang)), contentMarkdown: text(bodyField(lang)) },
      ]),
    ),
    included: RELEASE_NOTE_LANGS.filter((lang) => lang === REQUIRED_LANG || chosen.includes(lang)),
  };
}

/** 저장 요청 본문: 넣기로 한 언어판만(`POST`·`PUT`). 빈 날짜는 null(backend가 `releaseDate` 필수 오류로 알려 준다) */
export function writeBody(
  values: EditorValues,
  baseRevisionNo?: number,
): Omit<ReleaseNoteWrite, "releaseDate"> & { releaseDate: string | null } {
  return {
    version: values.version,
    releaseDate: values.releaseDate || null,
    contents: Object.fromEntries(values.included.map((lang) => [lang, values.contents[lang]])),
    ...(baseRevisionNo === undefined ? {} : { baseRevisionNo }),
  };
}
