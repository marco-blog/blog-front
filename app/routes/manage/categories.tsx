import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Form, Link, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { createApiClient } from "~/api/client.server";
import {
  VALIDATION_FAILED,
  requiredErrors,
  toFormError,
  useFormMessages,
  type FormErrorData,
} from "~/api/formErrors";
import type { CategoryNode, CategoryOrderItem, CreateCategoryRequest } from "~/api/models";
import { parsePostId } from "~/blog/ids";
import { FormAlert } from "~/components/form/FormField";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/categories";

/** backend `Category.NAME_MAX`와 같다. */
export const CATEGORY_NAME_MAX = 50;

type Intent = "create" | "rename" | "up" | "down" | "parent" | "delete";
const INTENTS: readonly Intent[] = ["create", "rename", "up", "down", "parent", "delete"];

type CategoriesActionData =
  { intent: Intent; ok: true } | (FormErrorData & { intent: string; ok: false });

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("category:manage.title"), t("appName"));
}

/** 카테고리 관리(`/:handle/manage/categories`, SSR, FR-023·024). 주인만, 아니면 404 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const categories = await createApiClient(request)
    .get<CategoryNode[]>(`/blogs/${handle}/categories`)
    .catch(throwManageError);
  return { handle, categories };
}

/** 같은 부모 아래 형제 목록(지금 순서). 없는 id면 null */
function siblingsOf(
  tree: CategoryNode[],
  id: number,
): { parentId: number | null; siblings: CategoryNode[] } | null {
  if (tree.some((node) => node.id === id)) {
    return { parentId: null, siblings: tree };
  }
  const parent = tree.find((node) => node.children.some((child) => child.id === id));
  return parent ? { parentId: parent.id, siblings: parent.children } : null;
}

/** 형제 목록을 이 순서대로 0부터 번호를 매긴다. */
function numbered(ids: number[], parentId: number | null): CategoryOrderItem[] {
  return ids.map((id, sortOrder) => ({ id, parentId, sortOrder }));
}

/**
 * 순서 변경 요청 본문. 위·아래는 형제끼리 자리를 바꾸고, 위치 옮기기는 새 부모의 맨 끝에 넣는다.
 * 깊이 규칙(2단계)과 이름 중복은 backend가 검사한다. 바꿀 것이 없으면 null
 */
export function orderChange(
  tree: CategoryNode[],
  intent: "up" | "down" | "parent",
  id: number,
  targetParentId: number | null = null,
): CategoryOrderItem[] | null {
  const place = siblingsOf(tree, id);
  if (!place) {
    return null;
  }
  const ids = place.siblings.map((node) => node.id);
  if (intent === "parent") {
    if (targetParentId === place.parentId || targetParentId === id) {
      return null;
    }
    const target =
      targetParentId === null
        ? tree
        : (tree.find((node) => node.id === targetParentId)?.children ?? []);
    return numbered([...target.map((node) => node.id), id], targetParentId);
  }
  const index = ids.indexOf(id);
  const swapWith = intent === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ids.length) {
    return null;
  }
  [ids[index], ids[swapWith]] = [ids[swapWith], ids[index]];
  return numbered(ids, place.parentId);
}

function fail(intent: string, error: unknown) {
  const { data: formError, status } = toFormError(error);
  return data<CategoriesActionData>({ ...formError, intent, ok: false }, { status });
}

function invalid(intent: string, fieldErrors: FormErrorData["fieldErrors"] = []) {
  return data<CategoriesActionData>(
    { intent, ok: false, resultCode: VALIDATION_FAILED, field: null, fieldErrors },
    { status: 400 },
  );
}

/** 만들기·이름 바꾸기·순서(위·아래·위치)·삭제. 끝나면 loader가 트리를 다시 읽는다. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  if (!(INTENTS as readonly string[]).includes(intentText)) {
    return invalid(intentText);
  }
  const intent = intentText as Intent;
  const api = createApiClient(request);
  const base = `/blogs/${handle}/categories`;
  const name = String(form.get("name") ?? "").trim();
  const parentId = parsePostId(String(form.get("parentId") ?? ""));
  const id = parsePostId(String(form.get("id") ?? ""));
  if (intent !== "create" && id === null) {
    return invalid(intent);
  }
  if (intent === "create" || intent === "rename") {
    const missing = requiredErrors({ name });
    if (missing.length > 0) {
      return invalid(intent, missing);
    }
  }

  try {
    if (intent === "create") {
      await api.post(base, { body: { name, parentId } satisfies CreateCategoryRequest });
    } else if (intent === "rename") {
      await api.patch(`${base}/${id}`, { body: { name } });
    } else if (intent === "delete") {
      await api.delete(`${base}/${id}`);
    } else {
      const tree = await api.get<CategoryNode[]>(base);
      const items = orderChange(tree, intent, id!, parentId);
      if (items) {
        await api.put(`${base}/order`, { body: items });
      }
    }
  } catch (error) {
    return fail(intent, error);
  }
  return data<CategoriesActionData>({ intent, ok: true });
}

const DONE_KEYS: Record<Intent, string> = {
  create: "category:manage.create.done",
  rename: "category:manage.rename.done",
  up: "category:manage.order.done",
  down: "category:manage.order.done",
  parent: "category:manage.order.done",
  delete: "category:manage.delete.done",
};

export default function ManageCategories() {
  const { t } = useTranslation();
  const { handle, categories } = useLoaderData<typeof loader>();
  const result = useActionData<CategoriesActionData>();
  const messages = useFormMessages(result && !result.ok ? result : null);
  const submitting = useNavigation().state === "submitting";
  const [confirming, setConfirming] = useState<CategoryNode | null>(null);
  const nameError = messages.fields.name
    ? `${t("category:manage.create.name")}: ${messages.fields.name}`
    : null;

  return (
    <main className="manage-categories">
      <h1>{t("category:manage.title")}</h1>
      <p>{t("category:manage.hint")}</p>
      {result?.ok && <p role="status">{t(DONE_KEYS[result.intent])}</p>}
      <FormAlert
        message={nameError ? `${messages.form ?? ""} ${nameError}`.trim() : messages.form}
      />

      <Form method="post" className="category-create" key={`create-${categories.length}`}>
        <fieldset>
          <legend>{t("category:manage.create.label")}</legend>
          <input type="hidden" name="intent" value="create" />
          <label>
            {t("category:manage.create.name")}{" "}
            <input name="name" required maxLength={CATEGORY_NAME_MAX} />
          </label>{" "}
          <label>
            {t("category:manage.create.parent")}{" "}
            <select name="parentId" defaultValue="">
              <option value="">{t("category:manage.create.top")}</option>
              {categories.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.name}
                </option>
              ))}
            </select>
          </label>{" "}
          <button type="submit" disabled={submitting}>
            {t("category:manage.create.submit")}
          </button>
        </fieldset>
      </Form>

      {categories.length === 0 ? (
        <p>{t("category:manage.empty")}</p>
      ) : (
        <ul className="category-manage-list" aria-label={t("category:manage.list")}>
          {categories.map((node, index) => (
            <li key={node.id}>
              <CategoryRow
                handle={handle}
                node={node}
                first={index === 0}
                last={index === categories.length - 1}
                parents={categories}
                parentId={null}
                submitting={submitting}
                onDelete={setConfirming}
              />
              {node.children.length > 0 && (
                <ul>
                  {node.children.map((child, childIndex) => (
                    <li key={child.id}>
                      <CategoryRow
                        handle={handle}
                        node={child}
                        first={childIndex === 0}
                        last={childIndex === node.children.length - 1}
                        parents={categories}
                        parentId={node.id}
                        submitting={submitting}
                        onDelete={setConfirming}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {confirming && (
        <div role="alertdialog" aria-labelledby="category-delete-message" className="confirm">
          <p id="category-delete-message">
            {t("category:manage.delete.confirm", {
              name: confirming.name,
              count: confirming.postCount,
            })}
          </p>
          <Form method="post" onSubmit={() => setConfirming(null)}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="id" value={confirming.id} />
            <button type="submit" disabled={submitting}>
              {t("category:manage.delete.confirmButton")}
            </button>{" "}
            <button type="button" onClick={() => setConfirming(null)}>
              {t("category:manage.delete.cancel")}
            </button>
          </Form>
        </div>
      )}
    </main>
  );
}

interface CategoryRowProps {
  handle: string;
  node: CategoryNode;
  first: boolean;
  last: boolean;
  /** 옮길 수 있는 상위 카테고리 후보(최상위 목록) */
  parents: CategoryNode[];
  parentId: number | null;
  submitting: boolean;
  onDelete: (node: CategoryNode) => void;
}

function CategoryRow({
  handle,
  node,
  first,
  last,
  parents,
  parentId,
  submitting,
  onDelete,
}: CategoryRowProps) {
  const { t } = useTranslation();
  const { name } = node;
  return (
    <div className="category-row">
      <Form method="post" className="category-rename" key={name}>
        <input type="hidden" name="intent" value="rename" />
        <input type="hidden" name="id" value={node.id} />
        <input
          name="name"
          required
          maxLength={CATEGORY_NAME_MAX}
          defaultValue={name}
          aria-label={t("category:manage.rename.label", { name })}
        />{" "}
        <button type="submit" disabled={submitting}>
          {t("category:manage.rename.submit")}
        </button>
      </Form>{" "}
      <span>{t("category:manage.postCount", { count: node.postCount })}</span>{" "}
      <Link to={`/${handle}/manage/posts?category=${node.id}`}>
        {t("category:manage.viewPosts")}
      </Link>{" "}
      <Form method="post" className="category-order">
        <input type="hidden" name="id" value={node.id} />
        <button
          type="submit"
          name="intent"
          value="up"
          disabled={submitting || first}
          aria-label={t("category:manage.order.up", { name })}
        >
          ↑
        </button>{" "}
        <button
          type="submit"
          name="intent"
          value="down"
          disabled={submitting || last}
          aria-label={t("category:manage.order.down", { name })}
        >
          ↓
        </button>
      </Form>{" "}
      {node.children.length === 0 && (
        <Form method="post" className="category-parent" key={`${node.id}-${parentId ?? ""}`}>
          <input type="hidden" name="intent" value="parent" />
          <input type="hidden" name="id" value={node.id} />
          <select
            name="parentId"
            defaultValue={parentId ?? ""}
            aria-label={t("category:manage.order.parent", { name })}
          >
            <option value="">{t("category:manage.create.top")}</option>
            {parents
              .filter((parent) => parent.id !== node.id)
              .map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
          </select>{" "}
          <button type="submit" disabled={submitting}>
            {t("category:manage.order.move")}
          </button>
        </Form>
      )}{" "}
      <button
        type="button"
        disabled={submitting}
        aria-label={t("category:manage.delete.label", { name })}
        onClick={() => onDelete(node)}
      >
        {t("category:manage.delete.submit")}
      </button>
    </div>
  );
}
