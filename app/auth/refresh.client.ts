import { loginPath } from "./paths";

/**
 * 브라우저 쪽 자동 리프레시(tasks.md "구현 전 결정 사항" 1번, AS4, quickstart #7).
 * 리프레시 토큰은 HttpOnly 쿠키라 스크립트로 읽지 않고, 같은 출처의 `/api/v1/auth/refresh`(front가 backend로 프록시)를 부르면
 * backend가 새 쿠키를 설정한다.
 */
export const REFRESH_PATH = "/api/v1/auth/refresh";

let inflight: Promise<boolean> | null = null;
let generation = 0;
let lastResult = false;

/** 리프레시가 끝날 때마다 1씩 는다. 요청을 보내기 전에 읽어 두면 그 뒤에 리프레시가 끝났는지 알 수 있다. */
export function refreshGeneration(): number {
  return generation;
}

/**
 * 리프레시를 한 번 부르고 성공 여부를 돌려준다. 이미 진행 중이면 그 결과를 함께 기다린다.
 * `since`(요청을 보낼 때의 refreshGeneration())보다 뒤에 끝난 리프레시가 있으면 다시 부르지 않고 그 결과를 쓴다.
 * 여러 요청이 동시에 401을 받아도 리프레시는 한 번이다.
 */
export function refreshSession(fetchImpl: typeof fetch = fetch, since?: number): Promise<boolean> {
  if (since !== undefined && since !== generation && !inflight) {
    return Promise.resolve(lastResult);
  }
  if (!inflight) {
    const current = (async () => {
      try {
        const response = await fetchImpl(REFRESH_PATH, {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        return response.ok;
      } catch {
        return false;
      }
    })().then((result) => {
      lastResult = result;
      generation += 1;
      inflight = null;
      return result;
    });
    inflight = current;
  }
  return inflight;
}

type LocationLike = Pick<Location, "pathname" | "search" | "assign">;

/** 로그인이 끝났으면 지금 주소를 next로 붙여 로그인 화면으로 보낸다. */
export function redirectToLogin(location: LocationLike = window.location): void {
  location.assign(loginPath(`${location.pathname}${location.search}`));
}
