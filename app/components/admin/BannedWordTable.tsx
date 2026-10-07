import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import type { AdminActionData } from "~/admin/actions.server";
import type { BannedWord } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

import { AdminFormErrors } from "./AdminFormErrors";

export const BANNED_WORD_SCOPES = ["NAME", "CONTENT", "ALL"] as const;
export const BANNED_WORD_ACTIONS = ["REJECT", "MASK"] as const;
/** 금칙어 길이(backend `BannedWord.WORD_MAX`) */
export const BANNED_WORD_MAX = 50;

type Scope = (typeof BANNED_WORD_SCOPES)[number];
type WordActionData = AdminActionData & { wordId?: number };

/**
 * 범위·처리 방식 선택. 이름류(NAME)는 가릴 수 없어(backend 400 `INVALID`) "가림"을 끈다(005 research M11).
 * JS가 없으면 둘 다 고를 수 있고 backend가 거절한다.
 */
function ScopeActionInputs({
  idPrefix,
  scope: initialScope,
  action,
}: {
  idPrefix: string;
  scope: Scope;
  action: BannedWord["action"];
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>(initialScope);
  return (
    <>
      <label htmlFor={`${idPrefix}-scope`}>{t("admin:spam.words.scope")}</label>{" "}
      <select
        id={`${idPrefix}-scope`}
        name="scope"
        defaultValue={initialScope}
        onChange={(event) => setScope(event.currentTarget.value as Scope)}
      >
        {BANNED_WORD_SCOPES.map((value) => (
          <option key={value} value={value}>
            {t(`admin:spam.words.scopes.${value}`)}
          </option>
        ))}
      </select>{" "}
      <label htmlFor={`${idPrefix}-action`}>{t("admin:spam.words.action")}</label>{" "}
      <select
        id={`${idPrefix}-action`}
        name="action"
        defaultValue={scope === "NAME" ? "REJECT" : action}
        key={scope === "NAME" ? "name" : "content"}
      >
        {BANNED_WORD_ACTIONS.map((value) => (
          <option key={value} value={value} disabled={value === "MASK" && scope === "NAME"}>
            {t(`admin:spam.words.actions.${value}`)}
          </option>
        ))}
      </select>
    </>
  );
}

export interface BannedWordTableProps {
  words: BannedWord[];
  totalCount: number;
  q: string;
  /** 추가·변경·삭제 결과(같은 화면 action) */
  result: WordActionData | null | undefined;
}

/**
 * 금칙어 목록(005 FR-143): 검색(`?q=`), 추가(단어·범위·처리 방식), 줄마다 범위·처리 방식 변경과 삭제(확인).
 * 단어는 텍스트로만 그린다.
 */
export function BannedWordTable({ words, totalCount, q, result }: BannedWordTableProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const submitting = useNavigation().state === "submitting";
  const addResult = result?.intent === "addWord" ? result : null;
  const confirmDelete = (word: string) => (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(t("admin:spam.words.deleteConfirm", { word }))) {
      event.preventDefault();
    }
  };

  return (
    <section aria-labelledby="banned-words-title" className="banned-words">
      <h2 id="banned-words-title">{t("admin:spam.words.title")}</h2>
      <p className="form-hint">{t("admin:spam.words.hint")}</p>
      <Form method="get" role="search">
        <label htmlFor="banned-word-q">{t("admin:spam.words.search")}</label>{" "}
        <input id="banned-word-q" type="search" name="q" defaultValue={q} maxLength={50} />{" "}
        <button type="submit">{t("admin:spam.words.searchSubmit")}</button>
      </Form>

      <Form method="post" className="banned-word-add" key={`add-${totalCount}`}>
        <h3>{t("admin:spam.words.add")}</h3>
        {addResult?.ok && <p role="status">{t("admin:spam.words.done.addWord")}</p>}
        <AdminFormErrors error={addResult && !addResult.ok ? addResult : null} />
        <input type="hidden" name="intent" value="addWord" />
        <label htmlFor="banned-word-new">{t("admin:spam.words.word")}</label>{" "}
        <input
          id="banned-word-new"
          name="word"
          required
          maxLength={BANNED_WORD_MAX}
          autoComplete="off"
        />{" "}
        <ScopeActionInputs idPrefix="banned-word-new" scope="ALL" action="REJECT" />{" "}
        <button type="submit" disabled={submitting}>
          {t("admin:spam.words.addSubmit")}
        </button>
      </Form>

      <p>{t("admin:spam.words.count", { count: totalCount })}</p>
      {words.length === 0 ? (
        <p>{t(q ? "admin:spam.words.noMatch" : "admin:spam.words.empty")}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">{t("admin:spam.words.word")}</th>
              <th scope="col">{t("admin:spam.words.setting")}</th>
              <th scope="col">{t("admin:spam.words.createdBy")}</th>
              <th scope="col">{t("admin:spam.words.delete")}</th>
            </tr>
          </thead>
          <tbody>
            {words.map((word) => {
              const own = result && result.wordId === word.id ? result : null;
              return (
                <tr key={word.id}>
                  <th scope="row">{word.word}</th>
                  <td>
                    <Form method="post" key={`${word.id}-${word.scope}-${word.action}`}>
                      <input type="hidden" name="intent" value="updateWord" />
                      <input type="hidden" name="id" value={word.id} />
                      <ScopeActionInputs
                        idPrefix={`banned-word-${word.id}`}
                        scope={word.scope}
                        action={word.action}
                      />{" "}
                      <button type="submit" disabled={submitting}>
                        {t("admin:spam.words.update")}
                      </button>
                    </Form>
                    {own?.ok && own.intent === "updateWord" && (
                      <p role="status">{t("admin:spam.words.done.updateWord")}</p>
                    )}
                    <AdminFormErrors error={own && !own.ok ? own : null} />
                  </td>
                  <td>
                    {word.createdBy.nickname}{" "}
                    <time dateTime={word.createdAt}>{format.dateTime(word.createdAt)}</time>
                  </td>
                  <td>
                    <Form method="post" onSubmit={confirmDelete(word.word)}>
                      <input type="hidden" name="intent" value="deleteWord" />
                      <input type="hidden" name="id" value={word.id} />
                      <button
                        type="submit"
                        disabled={submitting}
                        aria-label={t("admin:spam.words.deleteLabel", { word: word.word })}
                      >
                        {t("admin:spam.words.delete")}
                      </button>
                    </Form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
