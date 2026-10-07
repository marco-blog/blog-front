import { useTranslation } from "react-i18next";
import { Form, NavLink } from "react-router";

import {
  CONTENT_FIELDS,
  CONTENT_KINDS,
  contentPath,
  statusOptions,
  type ContentFilters,
  type ContentKind,
} from "~/admin/contentSearch";
import { fieldErrorMessages } from "~/api/errorMessage";
import type { ApiFieldError } from "~/api/types";
import { POST_VISIBILITY_FILTERS } from "~/manage/postFilters";

export interface ContentSearchFormProps {
  kind: ContentKind;
  filters: ContentFilters;
  scopeRequired: boolean;
  fieldErrors: readonly ApiFieldError[];
}

/** 상태 문구: 글은 블로그 관리의 상태 이름, 댓글·방명록은 콘솔 문구 */
function statusKey(kind: ContentKind, status: string) {
  return kind === "posts" ? `manage:status.${status}` : `admin:contents.status.${status}`;
}

/**
 * 콘텐츠 관리 탭과 검색 폼(006 T037). GET 폼이라 JS 없이 주소 쿼리로 검색한다. 댓글·방명록에서 범위 없이 내용만 넣으면
 * "블로그·글·작성자 중 하나를 먼저 정하세요"(backend `SCOPE_REQUIRED`).
 */
export function ContentSearchForm({
  kind,
  filters,
  scopeRequired,
  fieldErrors,
}: ContentSearchFormProps) {
  const { t } = useTranslation();
  const messages = fieldErrorMessages(
    t,
    fieldErrors.filter((error) => error.params?.reason !== "SCOPE_REQUIRED"),
  );
  const fields = CONTENT_FIELDS[kind];
  const text = (field: "q" | "handle" | "authorId" | "postId", label: string, numeric = false) => (
    <label key={field}>
      {label}{" "}
      <input
        type={field === "q" ? "search" : "text"}
        name={field}
        defaultValue={filters[field]}
        inputMode={numeric ? "numeric" : undefined}
        pattern={numeric ? "\\d*" : undefined}
        maxLength={field === "q" ? 100 : undefined}
        aria-invalid={messages[field] || (field === "q" && scopeRequired) ? true : undefined}
      />
      {messages[field] && <span className="field-error"> {messages[field]}</span>}
    </label>
  );
  return (
    <>
      <nav aria-label={t("admin:contents.tabs.label")} className="admin-tabs">
        <ul>
          {CONTENT_KINDS.map((entry) => (
            <li key={entry}>
              <NavLink to={contentPath(entry)}>{t(`admin:contents.tabs.${entry}`)}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Form method="get" role="search" aria-label={t("admin:contents.search.legend")}>
        <fieldset>
          <legend>{t("admin:contents.search.legend")}</legend>
          {fields.map((field) => {
            switch (field) {
              case "q":
                return text(
                  "q",
                  t(kind === "posts" ? "admin:contents.search.qPosts" : "admin:contents.search.q"),
                );
              case "handle":
                return text("handle", t("admin:contents.search.handle"));
              case "authorId":
                return text("authorId", t("admin:contents.search.authorId"), true);
              case "postId":
                return text("postId", t("admin:contents.search.postId"), true);
              case "status":
                return (
                  <label key="status">
                    {t("admin:contents.search.status")}{" "}
                    <select name="status" defaultValue={filters.status}>
                      <option value="">{t("admin:contents.search.all")}</option>
                      {statusOptions(kind).map((status) => (
                        <option key={status} value={status}>
                          {t(statusKey(kind, status))}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              case "visibility":
                return (
                  <label key="visibility">
                    {t("admin:contents.search.visibility")}{" "}
                    <select name="visibility" defaultValue={filters.visibility}>
                      <option value="">{t("admin:contents.search.all")}</option>
                      {POST_VISIBILITY_FILTERS.map((visibility) => (
                        <option key={visibility} value={visibility}>
                          {t(`manage:visibility.${visibility}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              default:
                return null;
            }
          })}{" "}
          <button type="submit">{t("admin:contents.search.submit")}</button>
        </fieldset>
        {kind !== "posts" && <p className="form-hint">{t("admin:contents.search.scopeHint")}</p>}
      </Form>
      {scopeRequired && (
        <p role="alert" className="form-alert">
          {t("admin:contents.scopeRequired")}
        </p>
      )}
    </>
  );
}

/** 표 아래 상태 이름(글은 블로그 관리 문구, 댓글·방명록은 콘솔 문구) */
export function useContentStatus(kind: ContentKind) {
  const { t } = useTranslation();
  return (status: string) => t(statusKey(kind, status));
}
