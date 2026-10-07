import { useTranslation } from "react-i18next";
import { Form, useActionData, useLoaderData } from "react-router";

import { adminNotFound, isAdminDenied, requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import { fieldErrorMessages } from "~/api/errorMessage";
import type { TopicMappingRule, TopicNode } from "~/api/models";
import { parsePage } from "~/blog/listing";
import { AdminExternalTabs } from "~/components/external/AdminExternalTabs";
import { RuleForm } from "~/components/external/RuleForm";
import { FormAlert } from "~/components/form/FormField";
import { Pagination } from "~/components/Pagination";
import { externalActionError, formId, formText, invalidField } from "~/external/actions.server";
import { formInteger } from "~/external/forms.server";
import { externalErrorMessage, type ExternalFormError } from "~/external/status";
import { topicLabel } from "~/external/topics";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-rules";

export const RULES_PAGE_SIZE = 50;
const PATH = "/admin/external-blogs/rules";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:admin.rules.title"), t("appName"));
}

export function rulesHref(q: string, page = 1): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${PATH}?${query}` : PATH;
}

/** 매핑 규칙(`/admin/external-blogs/rules?q=&page=`, 007 T071, FR-119): 우선순위 높은 순 표, 추가·수정·삭제. 이후 수집되는 글에만 적용된다. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const search = new URL(request.url).searchParams;
  const q = (search.get("q") ?? "").trim().slice(0, 100);
  const page = parsePage(search.get("page"));
  const api = createApiClient(request);
  const [list, topics] = await Promise.all([
    api.send<TopicMappingRule[]>("/admin/topic-mapping-rules", {
      query: { ...(q ? { q } : {}), page: page - 1, size: RULES_PAGE_SIZE },
    }),
    api.get<TopicNode[]>("/topics").catch(() => [] as TopicNode[]),
  ]).catch(throwAdminError);
  return {
    q,
    page,
    rules: list.result,
    totalCount: list.totalCount ?? list.result.length,
    topics,
  };
}

function ruleBody(form: FormData) {
  const keyword = formText(form, "keyword");
  if (!keyword) {
    throw invalidField("keyword", "REQUIRED");
  }
  const topicId = formId(form, "topicId");
  if (topicId === null) {
    throw invalidField("topicId", "REQUIRED");
  }
  const priority = formInteger(form, "priority", 0);
  if (priority === null) {
    throw invalidField("priority");
  }
  return { keyword, topicId, priority };
}

/** `intent=create|update|delete`. 수정·삭제는 `id`. 결과의 `id`로 어느 줄의 오류인지 고른다. */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const api = createApiClient(request);
  const form = await request.formData();
  const intent = formText(form, "intent");
  const id = formId(form, "id");
  try {
    switch (intent) {
      case "create":
        await api.post("/admin/topic-mapping-rules", { body: ruleBody(form) });
        break;
      case "update":
        if (id === null) throw invalidField("id");
        await api.patch(`/admin/topic-mapping-rules/${id}`, { body: ruleBody(form) });
        break;
      case "delete":
        if (id === null) throw invalidField("id");
        await api.delete(`/admin/topic-mapping-rules/${id}`);
        break;
      default:
        throw invalidField("intent");
    }
    return { intent, ok: true as const, id };
  } catch (error) {
    if (isAdminDenied(error)) {
      throw adminNotFound();
    }
    return externalActionError(intent, error, { id });
  }
}

export default function AdminExternalRules() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { q, page, rules, totalCount, topics } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const error = result && !result.ok ? (result.error as ExternalFormError) : null;
  const fields = error ? fieldErrorMessages(t, error.fieldErrors) : {};
  const existing = error?.params?.ruleId;
  const message = error
    ? typeof existing === "number"
      ? `${externalErrorMessage(t, error)} ${t("external:admin.rules.existing", { id: existing })}`
      : Object.keys(fields).length === 0
        ? externalErrorMessage(t, error)
        : null
    : null;
  const own = (intent: string, id: number | null) =>
    result?.intent === intent && (result.id ?? null) === id;
  const formAction = rulesHref(q, page);

  return (
    <main className="admin-external-rules">
      <AdminExternalTabs />
      <h1>{t("external:admin.rules.title")}</h1>
      <p className="field-hint">{t("external:admin.rules.hint")}</p>
      {result?.ok && <p role="status">{t(`external:admin.rules.${result.intent}d`)}</p>}

      <section aria-label={t("external:admin.rules.add")}>
        <h2>{t("external:admin.rules.add")}</h2>
        {own("create", null) && <FormAlert message={message} />}
        <RuleForm topics={topics} action={formAction} fields={own("create", null) ? fields : {}} />
      </section>

      <Form method="get" action={PATH} className="admin-search">
        <label htmlFor="rules-q">{t("external:admin.rules.search")}</label>
        <input id="rules-q" name="q" type="search" defaultValue={q} maxLength={100} />
        <button type="submit">{t("external:admin.list.searchSubmit")}</button>
      </Form>

      {rules.length === 0 ? (
        <p>{t("external:admin.rules.empty")}</p>
      ) : (
        <div className="table-scroll">
          <table className="admin-table" aria-label={t("external:admin.rules.title")}>
            <thead>
              <tr>
                <th>{t("external:admin.rules.keyword")}</th>
                <th>{t("external:common.topic")}</th>
                <th>{t("external:admin.rules.priority")}</th>
                <th>{t("external:admin.rules.createdBy")}</th>
                <th>{t("external:common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const mine = own("update", rule.id) || own("delete", rule.id);
                return (
                  <tr key={rule.id}>
                    <td>
                      <code>{rule.keyword}</code>
                    </td>
                    <td>{topicLabel(topics, rule.topicId, i18n.language)}</td>
                    <td>{rule.priority}</td>
                    <td>
                      {rule.createdBy.nickname} · {format.dateTime(rule.createdAt)}
                    </td>
                    <td>
                      {mine && <FormAlert message={message} />}
                      <details>
                        <summary>{t("external:admin.rules.update")}</summary>
                        <RuleForm
                          key={`${rule.id}-${rule.updatedAt}`}
                          topics={topics}
                          rule={rule}
                          action={formAction}
                          fields={own("update", rule.id) ? fields : {}}
                        />
                      </details>
                      <Form method="post" action={formAction}>
                        <input type="hidden" name="intent" value="delete" />
                        <input type="hidden" name="id" value={rule.id} />
                        <button
                          type="submit"
                          aria-label={`${t("external:admin.rules.delete")} ${rule.keyword}`}
                        >
                          {t("external:admin.rules.delete")}
                        </button>
                      </Form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={RULES_PAGE_SIZE}
        hrefFor={(target) => rulesHref(q, target)}
      />
    </main>
  );
}
