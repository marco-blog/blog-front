// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { JsonDiff, diffRows } from "~/components/admin/JsonDiff";

import { testI18n } from "../support/render";

const renderDiff = (
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) =>
  render(
    <I18nextProvider i18n={testI18n("ko")}>
      <JsonDiff before={before} after={after} />
    </I18nextProvider>,
  );

/** 변경 전후 비교(006 T047) */
describe("JsonDiff", () => {
  it("키별 전·후, 앞 객체의 키 순서 다음 뒤에만 있는 키", () => {
    expect(
      diffRows({ role: "USER", hidden: false }, { role: "ADMIN", note: { a: 1 }, hidden: false }),
    ).toEqual([
      { field: "role", before: "USER", after: "ADMIN", same: false },
      { field: "hidden", before: "false", after: "false", same: true },
      { field: "note", before: null, after: '{"a":1}', same: false },
    ]);
    expect(diffRows(null, undefined)).toEqual([]);
  });

  it("표: 바뀐 값과 같은 값(흐리게, 같음), 없는 값은 (없음)", () => {
    const { container } = renderDiff(
      { role: "USER", maxBlogs: 3 },
      { role: "ADMIN", maxBlogs: 3, reason: "승격" },
    );

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "항목변경 전변경 후",
      "roleUSERADMIN",
      "maxBlogs33 (같음)",
      "reason(없음)승격",
    ]);
    expect(container.querySelectorAll("tr.same")).toHaveLength(1);
    expect(rows[2]).toHaveClass("same");
    expect(rows[1]).toHaveClass("changed");
  });

  it("기록이 없으면 안내", () => {
    renderDiff(null, null);
    expect(screen.getByText("바뀐 값 기록이 없습니다.")).toBeInTheDocument();
  });
});
