// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LegalDocument } from "~/api/models";
import Privacy, { loader as privacyLoader, meta as privacyMeta } from "~/routes/privacy";
import Terms, { loader as termsLoader, meta as termsMeta } from "~/routes/terms";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

const doc = (lang: string, html = "<h1>제1조</h1><p>본문</p>"): LegalDocument => ({
  version: "2026-10-06",
  lang,
  authoritativeLang: "ko",
  effectiveAt: "2026-10-06T00:00:00Z",
  contentHtml: html,
});

type TermsLoaderArgs = Parameters<typeof termsLoader>[0];

describe("/terms·/privacy loader (SSR)", () => {
  it("화면 언어(쿠키·Accept-Language)로 /legal/terms?lang= 를 부른다", async () => {
    const backend = mockBackend({ "GET /api/v1/legal/terms": ok(doc("ja")) });

    const data = await termsLoader(
      routeArgs<TermsLoaderArgs>(getRequest("/terms", { "accept-language": "ja-JP,ja;q=0.9" })),
    );

    expect(data).toEqual({ document: doc("ja") });
    expect(backend.callsTo("GET /api/v1/legal/terms")[0].url.searchParams.get("lang")).toBe("ja");
  });

  it("로그인 회원은 회원 언어 설정을 따른다", async () => {
    const backend = mockBackend({
      "GET /api/v1/me": ok({ locale: "zh-CN", timeZone: "Asia/Seoul" }),
      "GET /api/v1/legal/privacy": ok(doc("zh-CN")),
    });

    await privacyLoader(
      routeArgs(getRequest("/privacy", { cookie: "access_token=a", "accept-language": "en" })),
    );

    expect(backend.callsTo("GET /api/v1/legal/privacy")[0].url.searchParams.get("lang")).toBe(
      "zh-CN",
    );
  });

  it("회원 정보를 못 읽어도 화면 언어 규칙으로 계속 그린다", async () => {
    const backend = mockBackend({
      "GET /api/v1/me": fail(500, "INTERNAL_ERROR"),
      "GET /api/v1/legal/terms": ok(doc("en")),
    });

    await termsLoader(
      routeArgs<TermsLoaderArgs>(
        getRequest("/terms", { cookie: "access_token=a", "accept-language": "en-US" }),
      ),
    );

    expect(backend.callsTo("GET /api/v1/legal/terms")[0].url.searchParams.get("lang")).toBe("en");
  });

  it("회원 정보 조회의 예상하지 못한 오류는 그대로 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("boom"))),
    );

    expect(
      await caught(
        termsLoader(routeArgs<TermsLoaderArgs>(getRequest("/terms", { cookie: "access_token=a" }))),
      ),
    ).toBeDefined();
  });

  it("backend 오류 상태를 그대로 응답한다", async () => {
    mockBackend({ "GET /api/v1/legal/terms": fail(500, "INTERNAL_ERROR") });

    expect(statusOf(await caught(termsLoader(routeArgs(getRequest("/terms")))))).toBe(500);
  });
});

describe("약관 화면", () => {
  it("본문(HTML), 시행일·버전, 한국어판이 아니면 '한국어판 우선' 안내", async () => {
    mockBackend({ "GET /api/v1/legal/terms": ok(doc("en", "<h2>Article 1</h2><p>Body</p>")) });
    renderRoutes([{ path: "terms", loader: termsLoader, Component: Terms }], {
      initialEntries: ["/terms"],
      language: "en",
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Terms of Service" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Article 1" })).toBeInTheDocument();
    expect(screen.getByText(/Version 2026-10-06/)).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "This is a translation. If it differs from the Korean version, the Korean version prevails.",
    );
  });

  it("한국어판에는 안내가 없다", async () => {
    mockBackend({ "GET /api/v1/legal/privacy": ok(doc("ko")) });
    renderRoutes([{ path: "privacy", loader: privacyLoader, Component: Privacy }], {
      initialEntries: ["/privacy"],
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "개인정보처리방침" }),
    ).toBeVisible();
    expect(screen.getByText("본문")).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("meta", () => {
  const args = (language: "ko" | "ja") =>
    ({ matches: [{ id: "root", loaderData: rootData(language) }] }) as never;

  it("제목 - 서비스명, 검색 허용", () => {
    expect(termsMeta(args("ko"))).toEqual([{ title: "이용약관 - 블로그" }]);
    expect(privacyMeta(args("ja"))).toEqual([{ title: "プライバシーポリシー - ブログ" }]);
  });
});
