// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { ErrorPage } from "~/components/ErrorPage";
import { NotFound } from "~/components/NotFound";
import type { Language } from "~/i18n/config";
import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import App, { ErrorBoundary, Layout, loader as rootLoader } from "~/root";
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

describe("root loader", () => {
  it("쿠키·Accept-Language로 언어를 정하고 그 언어와 대체 언어 리소스를 넘긴다", () => {
    const result = rootLoader({
      request: new Request("http://front.test/", { headers: { "accept-language": "ja" } }),
    } as Parameters<typeof rootLoader>[0]);

    expect(result.language).toBe("ja");
    expect(Object.keys(result.resources).sort()).toEqual(["en", "ja", "ko"]);
  });
});

describe("Home", () => {
  it("안내 문구를 화면 언어로 보여준다", () => {
    render(withI18n(<Home />, "en"));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Blog");
    expect(screen.getByText("Our blog service is coming soon.")).toBeInTheDocument();
  });

  it("meta title은 서비스 이름", () => {
    expect(homeMeta(metaArgs("zh-CN"))).toEqual([{ title: "博客" }]);
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

describe("ErrorBoundary", () => {
  type Props = Parameters<typeof ErrorBoundary>[0];
  const renderBoundary = (error: unknown) =>
    render(withI18n(<ErrorBoundary {...({ error } as Props)} />, "ko"));

  it("404 응답은 404 화면", () => {
    renderBoundary({ status: 404, statusText: "Not Found", internal: false, data: null });
    expect(screen.getByRole("heading")).toHaveTextContent("페이지를 찾을 수 없습니다");
  });

  it("API 오류 코드가 있으면 그 문구", () => {
    renderBoundary({
      status: 403,
      statusText: "",
      internal: false,
      data: { resultCode: "FORBIDDEN" },
    });
    expect(screen.getByText("이 작업을 할 권한이 없습니다.")).toBeInTheDocument();
  });

  it("코드가 없으면 일반 안내", () => {
    renderBoundary({ status: 500, statusText: "", internal: false, data: null });
    expect(screen.getByText("잠시 후 다시 시도해 주세요.")).toBeInTheDocument();
  });

  it("예상하지 못한 오류는 개발 환경에서 스택을 보여준다", () => {
    renderBoundary(new Error("boom"));
    expect(screen.getByRole("heading")).toHaveTextContent("문제가 생겼습니다");
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});

describe("ErrorPage", () => {
  it("넘긴 문구를 보여준다", () => {
    render(withI18n(<ErrorPage message="m" />));
    expect(screen.getByText("m")).toBeInTheDocument();
  });

  it("NotFound 단독", () => {
    render(withI18n(<NotFound />, "zh-CN"));
    expect(screen.getByRole("link")).toHaveTextContent("返回首页");
  });
});

describe("Layout", () => {
  it("root loader의 언어로 html lang과 화면을 그린다", async () => {
    const Stub = createRoutesStub([
      {
        id: "root",
        path: "/",
        loader: () => rootData("ja"),
        Component: () => (
          <Layout>
            <App />
          </Layout>
        ),
        HydrateFallback: () => null,
        children: [{ index: true, Component: Home }],
      },
    ]);

    render(<Stub />);

    expect(await screen.findByText("ブログサービスを準備しています。")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ja");
  });

  it("root 데이터가 없으면 기본 언어(en)로 그린다", async () => {
    const Stub = createRoutesStub([
      {
        id: "other",
        path: "/",
        Component: () => (
          <Layout>
            <p>child</p>
          </Layout>
        ),
      },
    ]);

    render(<Stub />);

    expect(await screen.findByText("child")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });
});
