// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAPTCHA_FIELD, Captcha, TURNSTILE_SCRIPT_URL } from "~/components/captcha/Captcha";
import type { CaptchaView } from "~/components/captcha/captcha.server";

import { testI18n } from "../support/render";

function renderCaptcha(captcha: CaptchaView | null) {
  return render(
    <I18nextProvider i18n={testI18n("ko")}>
      <form aria-label="form">
        <Captcha captcha={captcha} />
      </form>
    </I18nextProvider>,
  );
}

const view = (overrides: Partial<CaptchaView>): CaptchaView => ({
  provider: "none",
  siteKey: null,
  testToken: null,
  nonce: null,
  ...overrides,
});

afterEach(() => {
  delete (window as { turnstile?: unknown }).turnstile;
  document.head.querySelectorAll("script").forEach((script) => script.remove());
});

/** CAPTCHA 컴포넌트(005 T014) */
describe("Captcha", () => {
  it("test면 시험 모드 안내와 숨은 입력 captchaToken", () => {
    const { container } = renderCaptcha(view({ provider: "test", testToken: "e2e-pass" }));

    expect(screen.getByText(/시험 모드/)).toBeInTheDocument();
    const input = container.querySelector<HTMLInputElement>(`input[name="${CAPTCHA_FIELD}"]`);
    expect(input?.type).toBe("hidden");
    expect(input?.value).toBe("e2e-pass");
  });

  it("none·설정 없음이면 아무것도 그리지 않는다", () => {
    expect(renderCaptcha(view({})).container.querySelector(".captcha")).toBeNull();
    expect(renderCaptcha(null).container.querySelector(".captcha")).toBeNull();
  });

  it("turnstile이면 위젯 자리(사이트 키, 응답 필드 이름)와 nonce 붙은 스크립트, noscript 안내", () => {
    const { container } = renderCaptcha(
      view({ provider: "turnstile", siteKey: "site-key", nonce: "n0nce" }),
    );

    const widget = container.querySelector(".cf-turnstile");
    expect(widget).toHaveAttribute("data-sitekey", "site-key");
    expect(widget).toHaveAttribute("data-response-field-name", "captchaToken");
    const script = document.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_URL}"]`,
    );
    expect(script).not.toBeNull();
    expect(script?.nonce || script?.getAttribute("nonce")).toBe("n0nce");
    expect(container.querySelector("noscript")).not.toBeNull();
  });

  it("화면 이동으로 그려지면 불러온 스크립트로 위젯을 직접 그린다", () => {
    const renderWidget = vi.fn();
    (window as { turnstile?: unknown }).turnstile = { render: renderWidget };

    renderCaptcha(view({ provider: "turnstile", siteKey: "k" }));

    expect(renderWidget).toHaveBeenCalledTimes(1);
  });

  it("스크립트가 없으면 문서의 nonce로 붙인다", () => {
    const existing = document.createElement("script");
    existing.nonce = "doc-nonce";
    document.head.append(existing);

    renderCaptcha(view({ provider: "turnstile", siteKey: "k" }));

    const added = document.head.querySelector<HTMLScriptElement>(
      `script[src="${TURNSTILE_SCRIPT_URL}"]`,
    );
    expect(added?.nonce).toBe("doc-nonce");
  });
});
