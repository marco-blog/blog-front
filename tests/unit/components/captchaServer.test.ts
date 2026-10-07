import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAPTCHA_TEST_TOKEN,
  captchaConfig,
  captchaTestToken,
  captchaView,
} from "~/components/captcha/captcha.server";
import { cspNonceContext } from "~/server/requestContext";

import { mockBackend, ok } from "../support/backend";
import { getRequest } from "../support/route";

const CONFIG = "GET /api/v1/captcha/config";

/** CAPTCHA 설정 읽기(005 T014) */
describe("captcha.server", () => {
  it("GET /captcha/config는 요청당 한 번(메모)", async () => {
    const backend = mockBackend({ [CONFIG]: ok({ provider: "test", siteKey: null }) });
    const request = getRequest("/rights-request");

    await captchaConfig(request);
    await captchaConfig(request);
    expect(backend.callsTo(CONFIG)).toHaveLength(1);
    await captchaConfig(getRequest("/rights-request"));
    expect(backend.callsTo(CONFIG)).toHaveLength(2);
  });

  it("test면 토큰(환경 변수가 있으면 그 값), nonce는 넣지 않는다", async () => {
    mockBackend({ [CONFIG]: ok({ provider: "test", siteKey: null }) });

    await expect(captchaView(getRequest("/x"), undefined, {})).resolves.toEqual({
      provider: "test",
      siteKey: null,
      testToken: DEFAULT_CAPTCHA_TEST_TOKEN,
      nonce: null,
    });
    expect(captchaTestToken({ BLOG_CAPTCHA_TEST_TOKEN: " other " })).toBe("other");
    expect(captchaTestToken({})).toBe("e2e-pass");
  });

  it("turnstile이면 사이트 키와 이 요청의 nonce", async () => {
    mockBackend({ [CONFIG]: ok({ provider: "turnstile", siteKey: "site" }) });
    const context = new RouterContextProvider();
    context.set(cspNonceContext, "abc");

    await expect(captchaView(getRequest("/x"), context, {})).resolves.toEqual({
      provider: "turnstile",
      siteKey: "site",
      testToken: null,
      nonce: "abc",
    });
    await expect(
      captchaView(getRequest("/x"), new RouterContextProvider(), {}),
    ).resolves.toMatchObject({
      nonce: null,
    });
  });

  it("모르는 provider·backend 오류면 none", async () => {
    mockBackend({ [CONFIG]: ok({ provider: "other", siteKey: "x" }) });
    await expect(captchaConfig(getRequest("/x"))).resolves.toEqual({
      provider: "none",
      siteKey: null,
    });
    mockBackend({});
    await expect(captchaView(getRequest("/x"))).resolves.toMatchObject({ provider: "none" });
  });
});
