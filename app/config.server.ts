/** backend 기본 주소. 환경 변수 BLOG_BACKEND_URL이 없을 때 쓴다. */
export const DEFAULT_BACKEND_URL = "http://localhost:8080";

/** backend 주소(끝의 `/` 제거). 프록시와 SSR loader가 함께 쓴다. */
export function backendUrl(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.BLOG_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL;
  return value.replace(/\/+$/, "");
}
