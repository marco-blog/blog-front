import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

/** 릴리스 노트 검색창(003 FR-161). `/updates?q=`로 보낸다(JS 없이도 동작). */
export function ReleaseNoteSearch({ q = "", error }: { q?: string; error?: string | null }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <Form method="get" action="/updates" role="search" className="release-note-search">
      <label htmlFor={id}>{t("updates:search.label")}</label>{" "}
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={q}
        key={q}
        maxLength={100}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />{" "}
      <button type="submit">{t("updates:search.submit")}</button>
      {error && (
        <p id={`${id}-error`} className="form-error">
          {error}
        </p>
      )}
    </Form>
  );
}
