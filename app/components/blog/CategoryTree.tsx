import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { CategoryNode } from "~/api/models";

export function categoryHref(handle: string, categoryId: number): string {
  return `/${handle}/category/${categoryId}`;
}

/** 트리를 [노드, 깊이] 순서로 편다(상위 다음에 그 하위). */
export function flattenCategories(
  categories: CategoryNode[],
): { node: CategoryNode; depth: number; parentId: number | null }[] {
  return categories.flatMap((node) => [
    { node, depth: 0, parentId: null },
    ...node.children.map((child) => ({ node: child, depth: 1, parentId: node.id })),
  ]);
}

/** id로 카테고리(하위 포함)를 찾는다. */
export function findCategory(categories: CategoryNode[], id: number): CategoryNode | null {
  return flattenCategories(categories).find((item) => item.node.id === id)?.node ?? null;
}

export interface CategoryTreeProps {
  handle: string;
  categories: CategoryNode[];
  /** 지금 보고 있는 카테고리 */
  currentId?: number | null;
}

/**
 * 블로그 홈 옆의 카테고리 목록(2단계). 각 카테고리는 카테고리별 글 목록으로 가고,
 * 괄호 안 수는 "목록 노출 가능" 글 수(상위는 하위 글 포함)다.
 */
export function CategoryTree({ handle, categories, currentId = null }: CategoryTreeProps) {
  const { t } = useTranslation();
  if (categories.length === 0) {
    return null;
  }
  const item = (node: CategoryNode) => (
    <Link
      to={categoryHref(handle, node.id)}
      aria-current={node.id === currentId ? "page" : undefined}
    >
      {node.name} ({node.postCount})
    </Link>
  );
  return (
    <nav className="category-tree" aria-label={t("category:tree.label")}>
      <ul>
        <li>
          <Link to={`/${handle}`}>{t("category:tree.all")}</Link>
        </li>
        {categories.map((node) => (
          <li key={node.id}>
            {item(node)}
            {node.children.length > 0 && (
              <ul>
                {node.children.map((child) => (
                  <li key={child.id}>{item(child)}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

export interface CategorySelectProps {
  categories: CategoryNode[];
  value: number | null;
  onChange: (categoryId: number | null) => void;
  label?: string;
  name?: string;
  disabled?: boolean;
}

/** 카테고리 고르기. 첫 항목은 "미분류"(null), 하위 카테고리는 들여 쓴다. */
export function CategorySelect({
  categories,
  value,
  onChange,
  label,
  name,
  disabled = false,
}: CategorySelectProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="category-select">
      <label htmlFor={id}>{label ?? t("category:select.label")}</label>
      <select
        id={id}
        name={name}
        disabled={disabled}
        value={value === null ? "" : String(value)}
        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">{t("category:uncategorized")}</option>
        {flattenCategories(categories).map(({ node, depth }) => (
          <option key={node.id} value={node.id}>
            {`${"— ".repeat(depth)}${node.name}`}
          </option>
        ))}
      </select>
    </div>
  );
}
