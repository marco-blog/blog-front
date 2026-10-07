// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { MarkdownPreview } from "~/components/admin/MarkdownPreview";

import { testI18n } from "../support/render";

/** 미리보기(006 T058): backend가 살균한 HTML을 그대로, 목차 */
describe("MarkdownPreview", () => {
  it("HTML 그대로와 목차", () => {
    const { container } = render(
      <I18nextProvider i18n={testI18n("ko")}>
        <MarkdownPreview
          language="한국어"
          preview={{
            contentHtml: '<h2 id="a">첫 제목</h2><p><strong>굵게</strong></p>',
            toc: [{ level: 2, text: "첫 제목", anchor: "a" }],
          }}
        />
      </I18nextProvider>,
    );
    const region = screen.getByRole("region", { name: "미리보기: 한국어" });
    expect(container.querySelector(".release-note-content")?.innerHTML).toBe(
      '<h2 id="a">첫 제목</h2><p><strong>굵게</strong></p>',
    );
    expect(within(region).getByRole("link", { name: "첫 제목" })).toHaveAttribute("href", "#a");
  });

  it("목차가 없으면 목차를 그리지 않는다", () => {
    render(
      <I18nextProvider i18n={testI18n("en")}>
        <MarkdownPreview language="English" preview={{ contentHtml: "<p>x</p>", toc: [] }} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("region", { name: "Preview: English" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
