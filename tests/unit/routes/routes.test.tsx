// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import type { Language } from "~/i18n/config";
import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import NotFoundRoute, { loader as notFoundLoader, meta as notFoundMeta } from "~/routes/not-found";

function withI18n(ui: React.ReactNode, language: Language = "ko") {
  return (
    <I18nextProvider i18n={createI18n(language, resourcesFor(language))}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>
  );
}

const rootData = (language: Language) => ({ language, resources: resourcesFor(language) });
type MetaArgs = Parameters<typeof notFoundMeta>[0];
const metaArgs = (language: Language) =>
  ({ matches: [{ id: "root", loaderData: rootData(language) }] }) as unknown as MetaArgs;

describe("404", () => {
  it("loader는 404 상태로 응답한다", () => {
    const result = notFoundLoader();
    expect(result.init?.status).toBe(404);
  });

  it("meta는 noindex", () => {
    expect(notFoundMeta(metaArgs("ko") as unknown as Parameters<typeof notFoundMeta>[0])).toEqual([
      { title: "페이지를 찾을 수 없습니다 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });

  it("안내와 첫 화면 링크를 보여준다", () => {
    render(withI18n(<NotFoundRoute />, "ja"));

    expect(screen.getByRole("heading")).toHaveTextContent("ページが見つかりません");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/");
  });
});
