import type { RouterContextProvider } from "react-router";

import { createApiClient } from "~/api/client.server";
import type { CaptchaConfig } from "~/api/models";
import { cspNonceContext } from "~/server/requestContext";

/** `test` provider에서 보내는 기본 토큰(backend `blog.captcha.test-token` 기본값과 같다) */
export const DEFAULT_CAPTCHA_TEST_TOKEN = "e2e-pass";

/** 화면이 그리는 CAPTCHA 정보(005 FR-141). 직렬화해 loader 결과로 넘긴다. */
export interface CaptchaView {
  provider: CaptchaConfig["provider"];
  siteKey: string | null;
  /** `test`일 때만 숨은 입력에 넣는 값 */
  testToken: string | null;
  /** `turnstile` 스크립트에 붙일 이 요청의 CSP nonce(서버 렌더링 때만) */
  nonce: string | null;
}

/** `test` provider 토큰. 환경 변수 BLOG_CAPTCHA_TEST_TOKEN이 있으면 그 값 */
export function captchaTestToken(env: NodeJS.ProcessEnv = process.env): string {
  return env.BLOG_CAPTCHA_TEST_TOKEN?.trim() || DEFAULT_CAPTCHA_TEST_TOKEN;
}

const NONE: CaptchaConfig = { provider: "none", siteKey: null };
const memo = new WeakMap<Request, Promise<CaptchaConfig>>();

/**
 * `GET /captcha/config`를 요청당 한 번만 부른다(한 화면의 여러 loader가 함께 써도 한 번).
 * backend가 답하지 않으면 CAPTCHA 없이 그린다(backend가 토큰이 없다고 `CAPTCHA_FAILED`로 거절한다).
 */
export function captchaConfig(request: Request): Promise<CaptchaConfig> {
  let pending = memo.get(request);
  if (!pending) {
    pending = createApiClient(request)
      .get<CaptchaConfig>("/captcha/config")
      .then((config) =>
        config.provider === "turnstile" || config.provider === "test"
          ? { provider: config.provider, siteKey: config.siteKey ?? null }
          : NONE,
      )
      .catch(() => NONE);
    memo.set(request, pending);
  }
  return pending;
}

/** 이 요청의 CSP nonce. 보안 헤더 미들웨어를 거치지 않은 요청(시험 등)이면 null */
function nonceOf(context: Pick<RouterContextProvider, "get"> | undefined): string | null {
  try {
    return context?.get(cspNonceContext) ?? null;
  } catch {
    return null;
  }
}

/** loader용: 설정 + test 토큰 + 이 요청의 nonce */
export async function captchaView(
  request: Request,
  context?: Pick<RouterContextProvider, "get">,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CaptchaView> {
  const config = await captchaConfig(request);
  const nonce = nonceOf(context);
  return {
    provider: config.provider,
    siteKey: config.siteKey,
    testToken: config.provider === "test" ? captchaTestToken(env) : null,
    nonce: config.provider === "turnstile" ? nonce : null,
  };
}
