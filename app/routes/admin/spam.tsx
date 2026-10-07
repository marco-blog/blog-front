import { useTranslation } from "react-i18next";
import { data, useActionData, useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { createApiClient } from "~/api/client.server";
import type { BannedWord, Setting } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { parsePage } from "~/blog/listing";
import {
  BANNED_WORD_ACTIONS,
  BANNED_WORD_MAX,
  BANNED_WORD_SCOPES,
  BannedWordTable,
} from "~/components/admin/BannedWordTable";
import {
  DUPLICATE_FIELDS,
  DUPLICATE_KEY,
  RATE_LIMIT_KEYS,
  RateLimitForm,
  SPAM_SETTING_KEYS,
  type SpamSettingKey,
} from "~/components/admin/RateLimitForm";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { Pagination } from "~/components/Pagination";
import { parsePostId } from "~/blog/ids";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/spam";

export const BANNED_WORD_PAGE_SIZE = 20;
const PATH = "/admin/spam";
const INTENTS = ["setting", "resetSetting", "addWord", "updateWord", "deleteWord"] as const;
type Intent = (typeof INTENTS)[number];
export type SpamActionData = AdminActionData & { wordId?: number };

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:spam.title"), t("appName"));
}

export function spamHref(q: string, page = 1): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${PATH}?${query}` : PATH;
}

/**
 * 스팸 방어 설정(`/admin/spam?q=&page=`, 005 T082, FR-142~144): 작성 속도 한도 5개와 반복 댓글 기준(지금 값·기본값·
 * 바꾼 관리자, "기본값으로"), 금칙어 목록(검색·추가·범위/처리 방식 변경·삭제).
 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const q = (search.get("q") ?? "").trim().slice(0, BANNED_WORD_MAX);
  const page = parsePage(search.get("page"));
  const api = createApiClient(request);
  const [rateLimits, spam, words] = await Promise.all([
    api.get<Setting[]>("/admin/settings", { query: { prefix: "ratelimit." } }),
    api.get<Setting[]>("/admin/settings", { query: { prefix: "spam." } }),
    api.send<BannedWord[]>("/admin/banned-words", {
      query: { ...(q ? { q } : {}), page: page - 1, size: BANNED_WORD_PAGE_SIZE },
    }),
  ]).catch(throwAdminError);
  return {
    settings: [...rateLimits, ...spam],
    words: words.result,
    totalCount: words.totalCount ?? words.result.length,
    q,
    page,
  };
}

function integerField(form: FormData, name: string, field: string, errors: ApiFieldError[]) {
  const text = String(form.get(name) ?? "").trim();
  if (!text) {
    errors.push({ field, code: "REQUIRED" });
    return null;
  }
  const value = Number(text);
  if (!Number.isInteger(value)) {
    errors.push({ field, code: "INVALID" });
    return null;
  }
  return value;
}

/** 폼 값 → 설정 저장 값(범위는 backend가 검사한다) */
function settingValue(key: SpamSettingKey, form: FormData) {
  const errors: ApiFieldError[] = [];
  if (key === DUPLICATE_KEY) {
    const value = Object.fromEntries(
      DUPLICATE_FIELDS.map(({ name }) => [
        name,
        integerField(form, `duplicate.${name}`, `duplicate.${name}`, errors),
      ]),
    );
    return { value, errors };
  }
  return { value: integerField(form, "value", "value", errors), errors };
}

function wordBody(form: FormData, withWord: boolean) {
  const errors: ApiFieldError[] = [];
  const word = String(form.get("word") ?? "").trim();
  const scope = String(form.get("scope") ?? "");
  const action = String(form.get("action") ?? "");
  if (withWord && !word) errors.push({ field: "word", code: "REQUIRED" });
  if (!(BANNED_WORD_SCOPES as readonly string[]).includes(scope)) {
    errors.push({ field: "scope", code: "INVALID" });
  }
  if (!(BANNED_WORD_ACTIONS as readonly string[]).includes(action)) {
    errors.push({ field: "action", code: "INVALID" });
  }
  return { body: { ...(withWord ? { word } : {}), scope, action }, errors };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  if (!(INTENTS as readonly string[]).includes(intentText)) {
    return adminInvalid(intentText);
  }
  const intent = intentText as Intent;
  const api = createApiClient(request);

  if (intent === "setting" || intent === "resetSetting") {
    const key = String(form.get("key") ?? "");
    if (!(SPAM_SETTING_KEYS as readonly string[]).includes(key)) {
      return adminInvalid(intent);
    }
    const path = `/admin/settings/${encodeURIComponent(key)}`;
    try {
      if (intent === "resetSetting") {
        await api.delete(path);
      } else {
        const { value, errors } = settingValue(key as SpamSettingKey, form);
        if (errors.length > 0) {
          return adminInvalid(intent, errors, key);
        }
        await api.put(path, { body: { value } });
      }
    } catch (error) {
      // backend 입력란 이름(`value.maxCount`)을 화면 입력란 이름(`duplicate.maxCount`)으로
      return adminActionError(intent, error, {
        key,
        renameField: (field) => field.replace(/^value\./, "duplicate."),
      });
    }
    return data<SpamActionData>({ intent, ok: true, key });
  }

  if (intent === "addWord") {
    const { body, errors } = wordBody(form, true);
    if (errors.length > 0) {
      return adminInvalid(intent, errors);
    }
    try {
      await api.post("/admin/banned-words", { body });
    } catch (error) {
      return adminActionError(intent, error);
    }
    return data<SpamActionData>({ intent, ok: true });
  }

  const id = parsePostId(String(form.get("id") ?? ""));
  if (id === null) {
    return adminInvalid(intent);
  }
  const path = `/admin/banned-words/${id}`;
  try {
    if (intent === "deleteWord") {
      await api.delete(path);
    } else {
      const { body, errors } = wordBody(form, false);
      if (errors.length > 0) {
        return withWordId(adminInvalid(intent, errors), id);
      }
      await api.patch(path, { body });
    }
  } catch (error) {
    return withWordId(adminActionError(intent, error), id);
  }
  return data<SpamActionData>({ intent, ok: true, wordId: id });
}

/** 줄마다 결과를 보이도록 오류에 금칙어 번호를 붙인다 */
function withWordId(result: ReturnType<typeof adminInvalid>, wordId: number) {
  return data<SpamActionData>({ ...result.data, wordId } as SpamActionData, result.init ?? {});
}

export default function AdminSpam() {
  const { t } = useTranslation();
  const { settings, words, totalCount, q, page } = useLoaderData<typeof loader>();
  const result = useActionData<SpamActionData>();
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  const settingResult = (key: string) => (result?.key === key ? result : null);
  const wordResult =
    result && ["addWord", "updateWord", "deleteWord"].includes(result.intent) ? result : null;

  return (
    <main className="admin-spam">
      <h1>{t("admin:spam.title")}</h1>
      <p>{t("admin:spam.hint")}</p>
      <section aria-labelledby="rate-limits-title">
        <h2 id="rate-limits-title">{t("admin:spam.rateLimits")}</h2>
        {RATE_LIMIT_KEYS.map((key) => {
          const setting = byKey.get(key);
          return setting ? (
            <RateLimitForm key={key} setting={setting} result={settingResult(key)} />
          ) : null;
        })}
      </section>
      <section aria-labelledby="duplicate-title">
        <h2 id="duplicate-title">{t("admin:spam.duplicate")}</h2>
        {byKey.get(DUPLICATE_KEY) && (
          <RateLimitForm
            setting={byKey.get(DUPLICATE_KEY)!}
            result={settingResult(DUPLICATE_KEY)}
          />
        )}
      </section>
      {result?.intent === "deleteWord" && result.ok && (
        <p role="status">{t("admin:spam.words.done.deleteWord")}</p>
      )}
      {result?.intent === "deleteWord" && !result.ok && <AdminFormErrors error={result} />}
      <BannedWordTable words={words} totalCount={totalCount} q={q} result={wordResult} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={BANNED_WORD_PAGE_SIZE}
        hrefFor={(number) => spamHref(q, number)}
      />
    </main>
  );
}
