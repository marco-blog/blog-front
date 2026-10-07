/** backend 기본 주소. 환경 변수 BLOG_BACKEND_URL이 없을 때 쓴다. */
export const DEFAULT_BACKEND_URL = "http://localhost:8080";

/** backend 주소(끝의 `/` 제거). 프록시와 SSR loader가 함께 쓴다. */
export function backendUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.BLOG_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL;
  return value.replace(/\/+$/, "");
}

/**
 * 브라우저가 보는 서비스 출처(예: https://blog.java21.net). canonical·og:url 같은 절대 주소와,
 * front 서버가 스스로 보내는 상태 변경 요청(리프레시·조회수)의 Origin에 쓴다(backend `blog.base-url`과 같아야 한다).
 * 환경 변수 BLOG_PUBLIC_URL이 없으면 들어온 요청의 출처를 쓴다.
 */
export function publicOrigin(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.BLOG_PUBLIC_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // 잘못된 값이면 요청 출처를 쓴다.
    }
  }
  return new URL(request.url).origin;
}

/**
 * 화면 서버가 CSP에 Turnstile 출처를 더할지(005 FR-141). backend `blog.captcha.provider`와 같은 값을 환경 변수
 * BLOG_CAPTCHA_PROVIDER로 받는다(`turnstile`일 때만 true). 화면의 위젯 여부는 backend `GET /captcha/config`가 정한다.
 */
export function captchaTurnstile(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BLOG_CAPTCHA_PROVIDER?.trim().toLowerCase() === "turnstile";
}
