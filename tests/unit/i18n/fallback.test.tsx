import { renderToString } from "react-dom/server";
import {
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
  type StaticHandlerContext,
} from "react-router";
import { describe, expect, it, vi } from "vitest";

import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import App, { Layout, loader as rootLoader } from "~/root";

/**
 * 번역 대체(T226, FR-152, US5 AS6): 화면 언어에 없는 문구는 영어, 영어도 없으면 한국어이고 키 이름은 나오지 않는다.
 * SSR의 `<html lang>`과 브라우저로 넘기는 hydration 리소스가 같은 언어다.
 */

// 프레임워크 전용 요소(스크립트·메타 태그)는 정적 라우터에서 그릴 수 없어 빈 요소로 바꾼다.
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  Links: () => null,
  Meta: () => null,
  Scripts: () => null,
  ScrollRestoration: () => null,
}));

describe("대체 언어 (FR-152)", () => {
  it("화면 언어에 없는 키는 영어, 영어도 없으면 한국어", () => {
    const i18n = createI18n("ja", {
      ja: { common: { a: "ja-a" } },
      en: { common: { a: "en-a", b: "en-b" } },
      ko: { common: { a: "ko-a", b: "ko-b", c: "ko-c" } },
    });
    expect([i18n.t("a"), i18n.t("b"), i18n.t("c")]).toEqual(["ja-a", "en-b", "ko-c"]);
  });

  it("네임스페이스가 통째로 없어도 영어 → 한국어 순으로 찾고 키 이름을 보여주지 않는다", () => {
    const i18n = createI18n("zh-CN", {
      "zh-CN": { common: { a: "zh-a" } },
      en: { common: { a: "en-a" }, post: { title: "en-title" } },
      ko: { common: { a: "ko-a" }, post: { title: "ko-title", only: "ko-only" } },
    });
    expect(i18n.t("post:title")).toBe("en-title");
    expect(i18n.t("post:only")).toBe("ko-only");
    expect(i18n.t("post:only")).not.toMatch(/^(post:)?only$/);
  });

  it("빈 문자열은 번역이 없는 것으로 본다", () => {
    const i18n = createI18n("ja", { ja: { common: { a: "" } }, en: { common: { a: "en-a" } } });
    expect(i18n.t("a")).toBe("en-a");
  });

  it("resourcesFor는 화면 언어와 대체 언어(en, ko)만 담는다", () => {
    expect(Object.keys(resourcesFor("ja")).sort()).toEqual(["en", "ja", "ko"]);
    expect(Object.keys(resourcesFor("zh-CN")).sort()).toEqual(["en", "ko", "zh-CN"]);
    expect(Object.keys(resourcesFor("ko")).sort()).toEqual(["en", "ko"]);
  });
});

describe("SSR과 hydration이 같은 언어", () => {
  const routes = [
    {
      id: "root",
      path: "/",
      loader: rootLoader as never,
      Component: () => (
        <Layout>
          <App />
        </Layout>
      ),
      children: [{ index: true, Component: () => <p>home</p> }],
    },
  ];

  async function ssr(headers: Record<string, string>) {
    const handler = createStaticHandler(routes);
    const context = (await handler.query(
      new Request("http://front.test/", { headers }),
    )) as StaticHandlerContext;
    const router = createStaticRouter(handler.dataRoutes, context);
    return {
      html: renderToString(<StaticRouterProvider router={router} context={context} />),
      root: context.loaderData.root as Awaited<ReturnType<typeof rootLoader>>,
    };
  }

  it.each([
    ["ja-JP,ja;q=0.9", "ja", "利用規約"],
    ["zh-CN", "zh-CN", "服务条款"],
    ["fr", "en", "Terms of Service"],
  ])(
    "Accept-Language %s → <html lang=%s>, 같은 언어 리소스를 넘긴다",
    async (header, lang, terms) => {
      const { html, root } = await ssr({ "accept-language": header });

      expect(html).toContain(`<html lang="${lang}">`);
      expect(html).toContain(terms);
      expect(root.language).toBe(lang);
      expect(Object.keys(root.resources)).toContain(lang);
      // hydration 데이터(window.__staticRouterHydrationData)에 같은 언어·리소스가 실린다.
      expect(html).toContain("__staticRouterHydrationData");
      expect(html).toContain(JSON.stringify(lang));
    },
  );

  it("쿠키 lang이 Accept-Language보다 먼저", async () => {
    const { html, root } = await ssr({ cookie: "lang=ko", "accept-language": "ja" });

    expect(html).toContain('<html lang="ko">');
    expect(root.language).toBe("ko");
  });
});
