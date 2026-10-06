// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import type { CategoryNode } from "~/api/models";
import {
  CategorySelect,
  CategoryTree,
  findCategory,
  flattenCategories,
} from "~/components/blog/CategoryTree";

import { testI18n } from "../support/render";

const tree: CategoryNode[] = [
  {
    id: 1,
    name: "개발",
    postCount: 5,
    children: [
      { id: 2, name: "Spring", postCount: 3, children: [] },
      { id: 3, name: "JPA", postCount: 1, children: [] },
    ],
  },
  { id: 4, name: "일상", postCount: 0, children: [] },
];

function renderTree(categories: CategoryNode[], currentId: number | null = null) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <CategoryTree handle="marco" categories={categories} currentId={currentId} />
      ),
    },
  ]);
  return render(
    <I18nextProvider i18n={testI18n("ko")}>
      <Stub />
    </I18nextProvider>,
  );
}

describe("CategoryTree", () => {
  it("2단계 계층으로, 각 카테고리는 글 수와 함께 카테고리별 글 목록으로 간다", async () => {
    renderTree(tree, 2);

    const nav = await screen.findByRole("navigation", { name: "카테고리" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["전체 글", "/marco"],
      ["개발 (5)", "/marco/category/1"],
      ["Spring (3)", "/marco/category/2"],
      ["JPA (1)", "/marco/category/3"],
      ["일상 (0)", "/marco/category/4"],
    ]);
    const parent = within(nav).getByRole("link", { name: "개발 (5)" }).closest("li")!;
    expect(within(parent).getAllByRole("listitem")).toHaveLength(2);
    expect(within(nav).getByRole("link", { name: "Spring (3)" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("카테고리가 없으면 그리지 않는다", () => {
    renderTree([]);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("CategorySelect", () => {
  it('"미분류"가 첫 항목이고 하위는 들여 쓰며, 고르면 id(미분류는 null)', () => {
    const onChange = vi.fn();
    render(
      <I18nextProvider i18n={testI18n("ko")}>
        <CategorySelect categories={tree} value={3} onChange={onChange} />
      </I18nextProvider>,
    );

    const select = screen.getByRole("combobox", { name: "카테고리" });
    expect(select).toHaveValue("3");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["미분류", "개발", "— Spring", "— JPA", "일상"]);
    fireEvent.change(select, { target: { value: "4" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange.mock.calls).toEqual([[4], [null]]);
  });

  it("다른 언어의 미분류", () => {
    render(
      <I18nextProvider i18n={testI18n("en")}>
        <CategorySelect categories={[]} value={null} onChange={() => undefined} label="Pick" />
      </I18nextProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Pick" })).toHaveValue("");
    expect(screen.getByRole("option")).toHaveTextContent("Uncategorized");
  });
});

describe("트리 도우미", () => {
  it("flattenCategories·findCategory", () => {
    expect(
      flattenCategories(tree).map(({ node, depth, parentId }) => [node.id, depth, parentId]),
    ).toEqual([
      [1, 0, null],
      [2, 1, 1],
      [3, 1, 1],
      [4, 0, null],
    ]);
    expect(findCategory(tree, 3)?.name).toBe("JPA");
    expect(findCategory(tree, 99)).toBeNull();
  });
});
