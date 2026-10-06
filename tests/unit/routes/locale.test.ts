import { describe, expect, it } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import { languageCookie } from "~/i18n/languageCookie.server";
import { action, loader } from "~/routes/locale";

import { fail, mockBackend, ok } from "../support/backend";
import { expectRedirect, formRequest, routeArgs } from "../support/route";

/**
 * 하단 언어 선택 `/locale`(T224, FR-150, US5 AS2·3): 쿠키 `lang`(1년)을 저장하고, 로그인 상태면 `PATCH /me` `locale`,
 * 원래 페이지(같은 사이트 경로만)로 리다이렉트한다. 일반 폼 전송(JS 없음)과 같은 요청이다.
 */
type ActionArgs = Parameters<typeof action>[0];
const callAction = (request: Request) => action(routeArgs<ActionArgs>(request));

describe("/locale action", () => {
  it("비로그인: 쿠키 lang(1년)만 저장하고 원래 페이지로", async () => {
    const backend = mockBackend();
    const request = formRequest("/locale", { lang: "en", redirectTo: "/marco/12?page=2" });

    const result = await callAction(request);

    expect(expectRedirect(result)).toBe("/marco/12?page=2");
    expect(responseCookies(request)).toEqual([
      "lang=en; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax",
    ]);
    expect(backend.calls).toEqual([]);
  });

  it("로그인: 회원 설정에도 저장(PATCH /me locale)해 다른 기기에서도 그 언어", async () => {
    const backend = mockBackend({ "PATCH /api/v1/me": ok({ locale: "ja" }) });
    const request = formRequest(
      "/locale",
      { lang: "ja", redirectTo: "/settings/profile" },
      { cookie: "access_token=a; lang=en" },
    );

    const result = await callAction(request);

    expect(expectRedirect(result)).toBe("/settings/profile");
    expect(backend.callsTo("PATCH /api/v1/me")).toHaveLength(1);
    expect(backend.calls[0].body).toEqual({ locale: "ja" });
    expect(responseCookies(request)[0]).toMatch(/^lang=ja; Path=\/; Max-Age=31536000;/);
  });

  it("zh-CN은 쿠키 값으로 그대로 쓴다", async () => {
    mockBackend();
    const request = formRequest("/locale", { lang: "zh-CN", redirectTo: "/" });

    await callAction(request);

    expect(responseCookies(request)[0]).toMatch(/^lang=zh-CN;/);
  });

  it("회원 설정 저장이 실패해도 이 브라우저의 언어는 바꾼다", async () => {
    mockBackend({ "PATCH /api/v1/me": fail(502, "BACKEND_UNAVAILABLE") });
    const request = formRequest(
      "/locale",
      { lang: "ko", redirectTo: "/terms" },
      { cookie: "refresh_token=r" },
    );

    expect(expectRedirect(await callAction(request))).toBe("/terms");
    expect(responseCookies(request)[0]).toMatch(/^lang=ko;/);
  });

  it("지원하지 않는 언어면 아무것도 바꾸지 않고 돌아간다", async () => {
    const backend = mockBackend();
    const request = formRequest(
      "/locale",
      { lang: "fr", redirectTo: "/marco" },
      { cookie: "access_token=a" },
    );

    expect(expectRedirect(await callAction(request))).toBe("/marco");
    expect(responseCookies(request)).toEqual([]);
    expect(backend.calls).toEqual([]);
  });

  it.each([
    ["https://evil.example/", "/"],
    ["//evil.example/x", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
  ])("다른 사이트 주소(%s)로는 보내지 않는다", async (redirectTo, expected) => {
    mockBackend();
    const request = formRequest("/locale", { lang: "en", redirectTo });

    expect(expectRedirect(await callAction(request))).toBe(expected);
  });

  it("redirectTo가 없으면 같은 사이트의 Referer, 아니면 첫 화면", async () => {
    mockBackend();
    const sameSite = formRequest(
      "/locale",
      { lang: "en" },
      { referer: "http://front.test/marco/3?x=1" },
    );
    const otherSite = formRequest("/locale", { lang: "en" }, { referer: "https://evil.example/a" });
    const broken = formRequest("/locale", { lang: "en" }, { referer: "not a url" });
    const none = formRequest("/locale", { lang: "en" });

    expect(expectRedirect(await callAction(sameSite))).toBe("/marco/3?x=1");
    expect(expectRedirect(await callAction(otherSite))).toBe("/");
    expect(expectRedirect(await callAction(broken))).toBe("/");
    expect(expectRedirect(await callAction(none))).toBe("/");
  });

  it("GET /locale은 첫 화면으로", () => {
    expect(expectRedirect(loader())).toBe("/");
  });
});

describe("languageCookie", () => {
  it("운영(HTTPS)에서는 Secure", () => {
    expect(languageCookie("ja", true)).toBe(
      "lang=ja; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure",
    );
  });
});
