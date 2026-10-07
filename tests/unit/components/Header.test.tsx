// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { Header, type HeaderUser } from "~/components/layout/Header";

import { testI18n } from "../support/render";

const user = (role: string): HeaderUser => ({ userId: 1, nickname: "운영자", role });

function renderHeader(headerUser: HeaderUser | null, language: "ko" | "en" = "ko") {
  render(
    <I18nextProvider i18n={testI18n(language)}>
      <MemoryRouter>
        <Header user={headerUser} />
      </MemoryRouter>
    </I18nextProvider>,
  );
  return screen.getByRole("navigation", { name: language === "ko" ? "주 메뉴" : "Main menu" });
}

/** 상단 "시스템 관리"(006 FR-096, T025) */
describe("Header 시스템 관리", () => {
  it.each(["ADMIN", "SUPER_ADMIN"])("%s면 내 블로그 관리 다음에 /admin", (role) => {
    const nav = renderHeader(user(role));
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(links.indexOf("시스템 관리")).toBe(links.indexOf("내 블로그 관리") + 1);
    expect(within(nav).getByRole("link", { name: "시스템 관리" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });

  it("USER에게는 없다", () => {
    expect(
      within(renderHeader(user("USER"))).queryByRole("link", { name: "시스템 관리" }),
    ).toBeNull();
  });

  it("비로그인에는 없다", () => {
    expect(within(renderHeader(null)).queryByRole("link", { name: "시스템 관리" })).toBeNull();
  });

  it("영어 화면에서는 System admin", () => {
    const nav = renderHeader(user("ADMIN"), "en");
    expect(within(nav).getByRole("link", { name: "System admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
  });
});
