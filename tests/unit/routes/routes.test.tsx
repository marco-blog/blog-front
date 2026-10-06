// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import type { Language } from "~/i18n/config";
import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import Home, { meta as homeMeta } from "~/routes/home";
import NotFoundRoute, { loader as notFoundLoader, meta as notFoundMeta } from "~/routes/not-found";

function withI18n(ui: React.ReactNode, language: Language = "ko") {
  return (
    <I18nextProvider i18n={createI18n(language, resourcesFor(language))}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>
  );
}

const rootData = (language: Language) => ({ language, resources: resourcesFor(language) });
type MetaArgs = Parameters<typeof homeMeta>[0];
const metaArgs = (language: Language) =>
  ({ matches: [{ id: "root", loaderData: rootData(language) }] }) as unknown as MetaArgs;

describe("Home", () => {
  it("안내 문구를 화면 언어로 보여준다", () => {
    render(withI18n(<Home />, "en"));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Blog");
    expect(
      screen.getByText("A blog service for writing and sharing your posts."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up and create your blog" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("meta title은 서비스 이름, description은 소개", () => {
    expect(homeMeta(metaArgs("zh-CN"))).toEqual([
      { title: "博客" },
      { name: "description", content: "撰写和分享文章的博客服务。" },
    ]);
  });
});

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
