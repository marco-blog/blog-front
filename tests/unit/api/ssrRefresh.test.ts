import { describe, expect, it, vi } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import { createApiClient } from "~/api/client.server";
import { getSessionUser } from "~/auth/session.server";

import { fail, mockBackend, ok } from "../support/backend";

/**
 * SSR 리프레시(tasks.md "구현 전 결정 사항" 1번): front 서버가 401을 받으면 들어온 리프레시 쿠키로
 * `POST /api/v1/auth/refresh`를 요청당 한 번 부르고, 새 쿠키로 원 요청을 다시 보내며, 새 Set-Cookie를 브라우저로 넘긴다.
 */
const REFRESH = "POST /api/v1/auth/refresh";
const rotated = [
  "access_token=new-access; Path=/; HttpOnly; Secure; SameSite=Lax",
  "refresh_token=new-refresh; Path=/; HttpOnly; Secure; SameSite=Lax",
];

function rotatedHeaders() {
  const headers = new Headers();
  for (const cookie of rotated) headers.append("set-cookie", cookie);
  return headers;
}

/** 새 접근 토큰이 실려 와야 성공하는 backend */
function backendWithRotation() {
  return mockBackend({
    [REFRESH]: () => ok(null, { headers: rotatedHeaders() }),
    "GET /api/v1/me/blogs": (call) =>
      call.headers.get("cookie")?.includes("access_token=new-access")
        ? ok({ items: [], count: 0, limit: 3 })
        : fail(401, "UNAUTHENTICATED"),
    "GET /api/v1/me": (call) =>
      call.headers.get("cookie")?.includes("access_token=new-access")
        ? ok({ userId: 7, locale: "ko", blogs: [] })
        : fail(401, "UNAUTHENTICATED"),
  });
}

const page = (cookie: string | null, init: RequestInit = {}) =>
  new Request("http://front.test/settings/blogs", {
    ...init,
    headers: cookie ? { cookie, ...(init.headers ?? {}) } : init.headers,
  });

describe("SSR 리프레시", () => {
  it("401이면 리프레시 쿠키로 리프레시하고 새 쿠키로 다시 보낸 뒤, 새 Set-Cookie를 브라우저로 넘긴다", async () => {
    const backend = backendWithRotation();
    const request = page("access_token=expired; refresh_token=old; lang=ko");

    await expect(createApiClient(request).get("/me/blogs")).resolves.toEqual({
      items: [],
      count: 0,
      limit: 3,
    });

    expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "GET /api/v1/me/blogs",
      REFRESH,
      "GET /api/v1/me/blogs",
    ]);
    const refresh = backend.callsTo(REFRESH)[0];
    expect(refresh.headers.get("cookie")).toBe("access_token=expired; refresh_token=old; lang=ko");
    // 브라우저 Origin이 없는 서버 요청이므로 자기 출처를 Origin으로 싣는다(backend Origin 검사).
    expect(refresh.headers.get("origin")).toBe("http://front.test");
    expect(backend.calls[2].headers.get("cookie")).toBe(
      "access_token=new-access; refresh_token=new-refresh; lang=ko",
    );
    expect(responseCookies(request)).toEqual(rotated);
  });

  it("같은 요청의 여러 loader가 동시에 401을 받아도 리프레시는 한 번", async () => {
    const backend = backendWithRotation();
    const request = page("access_token=expired; refresh_token=old");

    await Promise.all([
      getSessionUser(request),
      createApiClient(request).get("/me/blogs"),
      createApiClient(request).get("/me/blogs"),
    ]);

    expect(backend.callsTo(REFRESH)).toHaveLength(1);
  });

  it("BLOG_PUBLIC_URL이 있으면 그 출처를 Origin으로", async () => {
    vi.stubEnv("BLOG_PUBLIC_URL", "https://blog.java21.net/");
    try {
      const backend = backendWithRotation();
      await createApiClient(page("access_token=x; refresh_token=old")).get("/me/blogs");
      expect(backend.callsTo(REFRESH)[0].headers.get("origin")).toBe("https://blog.java21.net");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("리프레시 쿠키가 없으면 리프레시하지 않고 401을 그대로", async () => {
    const backend = backendWithRotation();

    await expect(
      createApiClient(page("access_token=expired")).get("/me/blogs"),
    ).rejects.toMatchObject({ status: 401, resultCode: "UNAUTHENTICATED" });
    expect(backend.callsTo(REFRESH)).toHaveLength(0);
  });

  it("리프레시가 실패(REFRESH_INVALID)하면 원 401을 던지고, backend의 쿠키 삭제는 그대로 넘긴다", async () => {
    const cleared = "refresh_token=; Path=/; Max-Age=0";
    const backend = mockBackend({
      [REFRESH]: fail(401, "REFRESH_INVALID", [], { "set-cookie": cleared }),
      "GET /api/v1/me/blogs": fail(401, "UNAUTHENTICATED"),
      "GET /api/v1/me": fail(401, "UNAUTHENTICATED"),
    });
    const request = page("access_token=expired; refresh_token=revoked");

    await expect(createApiClient(request).get("/me/blogs")).rejects.toMatchObject({
      resultCode: "UNAUTHENTICATED",
    });
    // 같은 요청의 다음 호출은 다시 리프레시하지 않는다.
    await expect(getSessionUser(request)).resolves.toBeNull();

    expect(backend.callsTo(REFRESH)).toHaveLength(1);
    expect(responseCookies(request)).toEqual([cleared]);
  });

  it("리프레시 요청이 네트워크 오류면 실패로 본다", async () => {
    let refreshCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/auth/refresh")) {
          refreshCalls += 1;
          throw new TypeError("down");
        }
        return fail(401, "UNAUTHENTICATED");
      }),
    );

    await expect(createApiClient(page("refresh_token=r")).get("/me/blogs")).rejects.toMatchObject({
      resultCode: "UNAUTHENTICATED",
    });
    expect(refreshCalls).toBe(1);
  });

  it("UNAUTHENTICATED가 아닌 401이나 /auth 요청은 리프레시하지 않는다", async () => {
    const backend = mockBackend({
      [REFRESH]: ok(null),
      "POST /api/v1/auth/login": fail(401, "INVALID_CREDENTIALS"),
      "POST /api/v1/auth/logout": fail(401, "UNAUTHENTICATED"),
    });
    const request = page("refresh_token=r", {
      method: "POST",
      headers: { origin: "http://front.test" },
    });

    await expect(createApiClient(request).post("/auth/login", { body: {} })).rejects.toBeTruthy();
    await expect(createApiClient(request).post("/auth/logout")).rejects.toBeTruthy();

    expect(backend.callsTo(REFRESH)).toHaveLength(0);
  });

  it("브라우저가 보낸 Origin은 그대로 전달한다(상태 변경 요청)", async () => {
    const backend = mockBackend({ "POST /api/v1/blogs": ok(null) });

    await createApiClient(
      page("access_token=a", { method: "POST", headers: { origin: "https://evil.example" } }),
    ).post("/blogs", { body: {} });

    expect(backend.calls[0].headers.get("origin")).toBe("https://evil.example");
  });
});
