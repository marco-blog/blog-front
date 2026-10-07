import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { CaptchaView } from "./captcha.server";

/** 폼 필드 이름. backend 요청 본문의 `captchaToken`과 같다(005 contracts/api.md "CAPTCHA") */
export const CAPTCHA_FIELD = "captchaToken";
/** Cloudflare Turnstile 스크립트. 출처는 server/securityHeaders.ts의 TURNSTILE_ORIGIN과 같다 */
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";

interface TurnstileApi {
  render: (element: HTMLElement) => unknown;
}

/** 이미 불러온 스크립트의 nonce(브라우저는 nonce 속성을 감추지만 `nonce` 속성값은 남는다) */
function documentNonce(): string {
  const script = document.querySelector<HTMLScriptElement>("script[nonce]");
  return script?.nonce ?? "";
}

/**
 * Turnstile 위젯 자리. 서버 렌더링이면 스크립트가 `.cf-turnstile`을 찾아 그리고, 화면 이동으로 나중에 그려지면
 * 이미 불러온 스크립트로 직접 그리거나 문서의 nonce로 스크립트를 붙인다. 위젯은 응답 토큰을 숨은 입력 `captchaToken`에 넣는다.
 */
function TurnstileWidget({ siteKey, nonce }: { siteKey: string; nonce: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || element.childElementCount > 0) return;
    const turnstile = (window as { turnstile?: TurnstileApi }).turnstile;
    if (turnstile) {
      turnstile.render(element);
      return;
    }
    if (!document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)) {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.nonce = documentNonce();
      document.head.append(script);
    }
  }, []);
  return (
    <>
      {nonce && <script src={TURNSTILE_SCRIPT_URL} async defer nonce={nonce} />}
      <div
        ref={ref}
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-response-field-name={CAPTCHA_FIELD}
      />
    </>
  );
}

/**
 * CAPTCHA(005 FR-141, contracts/routes.md): `turnstile`이면 위젯과 nonce 붙은 스크립트(그 화면에서만), JS가 없으면
 * `<noscript>` 안내. `test`면 "시험 모드" 표시와 숨은 입력(값은 front 환경 변수 `BLOG_CAPTCHA_TEST_TOKEN`, 기본 `e2e-pass`).
 * `none`이면 아무것도 그리지 않는다.
 */
export function Captcha({ captcha }: { captcha: CaptchaView | null | undefined }) {
  const { t } = useTranslation();
  if (!captcha || captcha.provider === "none") {
    return null;
  }
  if (captcha.provider === "test") {
    return (
      <div className="captcha captcha-test" aria-label={t("moderation:captcha.label")} role="group">
        <p className="form-hint">{t("moderation:captcha.testMode")}</p>
        <input type="hidden" name={CAPTCHA_FIELD} value={captcha.testToken ?? ""} />
      </div>
    );
  }
  return (
    <div className="captcha" aria-label={t("moderation:captcha.label")} role="group">
      <TurnstileWidget siteKey={captcha.siteKey ?? ""} nonce={captcha.nonce} />
      <noscript>
        <p className="form-hint">{t("moderation:captcha.noscript")}</p>
      </noscript>
    </div>
  );
}
