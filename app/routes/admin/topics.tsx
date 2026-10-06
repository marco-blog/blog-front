import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { createApiClient } from "~/api/client.server";
import type { AdminTopicNode, TopicNames } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { parsePostId } from "~/blog/ids";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { SUPPORTED_LANGUAGES } from "~/i18n/config";
import { metaT } from "~/i18n/meta";
import { topicName } from "~/portal/topics";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/topics";

/** backend `Topic.NAME_MAX`·`SLUG_MAX`와 같다. */
export const TOPIC_NAME_MAX = 50;
export const TOPIC_SLUG_MAX = 50;

const INTENTS = ["create", "update", "hide", "unhide", "pin", "unpin", "up", "down"] as const;
type Intent = (typeof INTENTS)[number];

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:topics.title"), t("appName"));
}

/** 주제 관리(`/admin/topics`, 003 T101, FR-079): 숨긴 주제까지 모두 보이는 관리자 트리 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const topics = await createApiClient(request)
    .get<AdminTopicNode[]>("/admin/topics")
    .catch(throwAdminError);
  return { topics };
}

/** 위·아래로 한 칸 옮긴 그 부모의 자식 전체 순서. 옮길 수 없으면 null */
export function reorderedIds(
  tree: AdminTopicNode[],
  id: number,
  direction: "up" | "down",
): { parentId: number | null; ids: number[] } | null {
  const parent = tree.find((major) => major.children.some((child) => child.id === id));
  const siblings = tree.some((major) => major.id === id) ? tree : parent?.children;
  if (!siblings) {
    return null;
  }
  const ids = siblings.map((node) => node.id);
  const index = ids.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) {
    return null;
  }
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return { parentId: parent ? parent.id : null, ids };
}

/** 폼의 `names.{언어}` 4개. 빈 값도 그대로(검사는 backend가 언어별로 한다) */
function namesFrom(form: FormData): TopicNames {
  return Object.fromEntries(
    SUPPORTED_LANGUAGES.map((language) => [
      language,
      String(form.get(`names.${language}`) ?? "").trim(),
    ]),
  ) as TopicNames;
}

function colorFrom(form: FormData): string | null {
  const color = String(form.get("cardColor") ?? "").trim();
  return color ? color : null;
}

/** 추가·이름과 색 수정·숨김·탭 고정·순서. 끝나면 loader가 트리를 다시 읽는다. */
export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  if (!(INTENTS as readonly string[]).includes(intentText)) {
    return adminInvalid(intentText);
  }
  const intent = intentText as Intent;
  const id = parsePostId(String(form.get("id") ?? ""));
  if (intent !== "create" && id === null) {
    return adminInvalid(intent);
  }
  const api = createApiClient(request);

  if (intent === "create") {
    const slug = String(form.get("slug") ?? "").trim();
    const names = namesFrom(form);
    const missing: ApiFieldError[] = [
      ...(slug ? [] : [{ field: "slug", code: "REQUIRED" }]),
      ...SUPPORTED_LANGUAGES.filter((language) => !names[language]).map((language) => ({
        field: `names.${language}`,
        code: "REQUIRED",
      })),
    ];
    if (missing.length > 0) {
      return adminInvalid(intent, missing);
    }
    const parentId = parsePostId(String(form.get("parentId") ?? ""));
    try {
      await api.post("/admin/topics", {
        body: { parentId, slug, names, cardColor: colorFrom(form) },
      });
    } catch (error) {
      return adminActionError(intent, error);
    }
    return data<AdminActionData>({ intent, ok: true });
  }

  try {
    if (intent === "update") {
      await api.patch(`/admin/topics/${id}`, {
        body: { names: namesFrom(form), cardColor: colorFrom(form) },
      });
    } else if (intent === "hide" || intent === "unhide") {
      await api.patch(`/admin/topics/${id}`, { body: { adminHidden: intent === "hide" } });
    } else if (intent === "pin" || intent === "unpin") {
      await api.patch(`/admin/topics/${id}`, { body: { pinnedOnTab: intent === "pin" } });
    } else {
      const tree = await api.get<AdminTopicNode[]>("/admin/topics");
      const order = reorderedIds(tree, id!, intent);
      if (order) {
        await api.put("/admin/topics/order", { body: order });
      }
    }
  } catch (error) {
    return adminActionError(intent, error);
  }
  return data<AdminActionData>({ intent, ok: true });
}

const DONE_KEYS: Record<Intent, string> = {
  create: "admin:topics.done.create",
  update: "admin:topics.done.update",
  hide: "admin:topics.done.hide",
  unhide: "admin:topics.done.unhide",
  pin: "admin:topics.done.pin",
  unpin: "admin:topics.done.unpin",
  up: "admin:topics.done.order",
  down: "admin:topics.done.order",
};

export default function AdminTopics() {
  const { t, i18n } = useTranslation();
  const { topics } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const submitting = useNavigation().state === "submitting";

  return (
    <main className="admin-topics">
      <h1>{t("admin:topics.title")}</h1>
      <p>{t("admin:topics.hint")}</p>
      {result?.ok && <p role="status">{t(DONE_KEYS[result.intent as Intent])}</p>}
      <AdminFormErrors error={result && !result.ok ? result : null} />

      <Form method="post" className="topic-create" key={`create-${countTopics(topics)}`}>
        <fieldset>
          <legend>{t("admin:topics.create.label")}</legend>
          <input type="hidden" name="intent" value="create" />
          <label>
            {t("admin:topics.create.parent")}{" "}
            <select name="parentId" defaultValue="">
              <option value="">{t("admin:topics.create.major")}</option>
              {topics.map((major) => (
                <option key={major.id} value={major.id}>
                  {topicName(major.names, i18n.language)}
                </option>
              ))}
            </select>
          </label>{" "}
          <label>
            {t("admin:fields.slug")}{" "}
            <input
              name="slug"
              required
              maxLength={TOPIC_SLUG_MAX}
              pattern="[a-z0-9-]+"
              autoComplete="off"
            />
          </label>
          <NameInputs />
          <ColorInput />
          <p className="form-hint">{t("admin:topics.create.slugHint")}</p>
          <button type="submit" disabled={submitting}>
            {t("admin:topics.create.submit")}
          </button>
        </fieldset>
      </Form>

      {topics.length === 0 ? (
        <p>{t("admin:topics.empty")}</p>
      ) : (
        <ul className="admin-topic-tree" aria-label={t("admin:topics.list")}>
          {topics.map((major, index) => (
            <li key={major.id}>
              <TopicRow
                node={major}
                first={index === 0}
                last={index === topics.length - 1}
                submitting={submitting}
              />
              {major.children.length > 0 && (
                <ul>
                  {major.children.map((minor, minorIndex) => (
                    <li key={minor.id}>
                      <TopicRow
                        node={minor}
                        first={minorIndex === 0}
                        last={minorIndex === major.children.length - 1}
                        submitting={submitting}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function countTopics(topics: AdminTopicNode[]): number {
  return topics.reduce((sum, major) => sum + 1 + major.children.length, 0);
}

function NameInputs({ names }: { names?: TopicNames }) {
  const { t } = useTranslation();
  return (
    <>
      {SUPPORTED_LANGUAGES.map((language) => (
        <label key={language}>
          {t(`admin:fields.names.${language}`)}{" "}
          <input
            name={`names.${language}`}
            required
            maxLength={TOPIC_NAME_MAX}
            defaultValue={names?.[language] ?? ""}
          />
        </label>
      ))}
    </>
  );
}

function ColorInput({ color }: { color?: string | null }) {
  const { t } = useTranslation();
  return (
    <label>
      {t("admin:fields.cardColor")}{" "}
      <input
        name="cardColor"
        defaultValue={color ?? ""}
        placeholder="#3D7DD8"
        pattern="#[0-9A-Fa-f]{6}"
        maxLength={7}
      />
    </label>
  );
}

interface TopicRowProps {
  node: AdminTopicNode;
  first: boolean;
  last: boolean;
  submitting: boolean;
}

function TopicRow({ node, first, last, submitting }: TopicRowProps) {
  const { t, i18n } = useTranslation();
  const name = topicName(node.names, i18n.language);
  const major = node.parentId === null || node.parentId === undefined;
  return (
    <section className="admin-topic" aria-label={name}>
      <h2>
        {name} <code>{node.slug}</code>
      </h2>
      <p className="admin-topic-state">
        {node.adminHidden && <span className="badge">{t("admin:topics.hidden")}</span>}{" "}
        {!node.adminHidden && node.effectiveHidden && (
          <span className="badge">{t("admin:topics.hiddenByParent")}</span>
        )}{" "}
        {node.pinnedOnTab && <span className="badge">{t("admin:topics.pinned")}</span>}{" "}
        {major && !node.onTab && !node.effectiveHidden && (
          <span className="badge">{t("admin:topics.offTab")}</span>
        )}{" "}
        <span>{t("admin:topics.recentPosts", { count: node.recentPostCount })}</span>
      </p>
      <Form
        method="post"
        className="admin-topic-edit"
        key={`${node.id}-${JSON.stringify(node.names)}-${node.cardColor ?? ""}`}
      >
        <input type="hidden" name="intent" value="update" />
        <input type="hidden" name="id" value={node.id} />
        <NameInputs names={node.names} />
        <ColorInput color={node.cardColor} />
        <button type="submit" disabled={submitting}>
          {t("admin:topics.save")}
        </button>
      </Form>
      <Form method="post" className="admin-topic-actions">
        <input type="hidden" name="id" value={node.id} />
        <button
          type="submit"
          name="intent"
          value={node.adminHidden ? "unhide" : "hide"}
          disabled={submitting}
        >
          {t(node.adminHidden ? "admin:topics.unhide" : "admin:topics.hide")}
        </button>{" "}
        {major && (
          <button
            type="submit"
            name="intent"
            value={node.pinnedOnTab ? "unpin" : "pin"}
            disabled={submitting}
          >
            {t(node.pinnedOnTab ? "admin:topics.unpin" : "admin:topics.pin")}
          </button>
        )}{" "}
        <button
          type="submit"
          name="intent"
          value="up"
          disabled={submitting || first}
          aria-label={t("admin:topics.up", { name })}
        >
          ↑
        </button>{" "}
        <button
          type="submit"
          name="intent"
          value="down"
          disabled={submitting || last}
          aria-label={t("admin:topics.down", { name })}
        >
          ↓
        </button>
      </Form>
    </section>
  );
}
