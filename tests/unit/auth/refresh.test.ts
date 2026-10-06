import { describe, expect, it, vi } from "vitest";

import { createBrowserApi } from "~/api/client";
import { ApiError, CLIENT_ERROR_CODES } from "~/api/errors";
import { redirectToLogin, refreshSession } from "~/auth/refresh.client";

import { fail, mockBackend, ok } from "../support/backend";

/**
 * 브라우저 API 호출과 자동 리프레시(tasks.md "구현 전 결정 사항" 1번, AS4, quickstart #7).
 * 접근 토큰이 만료되면(401 UNAUTHENTICATED) 리프레시를 한 번만 부르고 원 요청을 다시 보낸다.
 */
const REFRESH = "POST /api/v1/auth/refresh";

/** 리프레시 전에는 401, 리프레시 뒤에는 성공하는 backend */
function expiringBackend(extra: Record<string, Response> = {}) {
  let refreshed = false;
  const backend = mockBackend({
    ...extra,
    [REFRESH]: () => {
      refreshed = true;
      return ok(null);
    },
    "GET /api/v1/me/blogs": () =>
      refreshed ? ok({ items: [], count: 0, limit: 3 }) : fail(401, "UNAUTHENTICATED"),
    "PUT /api/v1/posts/7/draft": () =>
      refreshed ? ok({ id: 7, savedAt: "2026-10-06T04:24:19Z" }) : fail(401, "UNAUTHENTICATED"),
  });
  return backend;
}

describe("브라우저 API 클라이언트", () => {
  it("/api/v1 경로로 같은 출처 쿠키와 함께 보내고 result를 돌려준다", async () => {
    const backend = mockBackend({
      "GET /api/v1/auth/handle-availability": ok({ available: true }),
      "PUT /api/v1/posts/7/draft": ok({ id: 7, savedAt: "t" }),
    });
    const api = createBrowserApi();

    await expect(
      api.get("/auth/handle-availability", { query: { handle: "marco", empty: undefined } }),
    ).resolves.toEqual({ available: true });
    await api.put("/posts/7/draft", { body: { title: "제목", contentMarkdown: "본문" } });

    const [get, put] = backend.calls;
    expect(get.url.pathname + get.url.search).toBe("/api/v1/auth/handle-availability?handle=marco");
    expect(put.body).toEqual({ title: "제목", contentMarkdown: "본문" });
    expect(put.headers.get("content-type")).toBe("application/json");
    const init = backend.fetch.mock.calls[0][1]!;
    expect(init.credentials).toBe("same-origin");
  });

  it("send는 totalCount도 돌려준다", async () => {
    mockBackend({ "GET /api/v1/blogs/marco/posts": ok([{ id: 1 }], { totalCount: 41 }) });

    const result = await createBrowserApi().send("/blogs/marco/posts", { query: { page: 2 } });

    expect(result).toMatchObject({ result: [{ id: 1 }], totalCount: 41, status: 200 });
  });

  it("실패는 resultCode·fieldErrors를 담은 ApiError", async () => {
    mockBackend({
      "POST /api/v1/blogs": fail(400, "VALIDATION_FAILED", [{ field: "handle", code: "REQUIRED" }]),
    });

    const error = await createBrowserApi()
      .post("/blogs", { body: {} })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      resultCode: "VALIDATION_FAILED",
      fieldErrors: [{ field: "handle", code: "REQUIRED" }],
    });
  });

  it("네트워크 오류·공통 틀이 아닌 응답도 ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    await expect(createBrowserApi().get("/me")).rejects.toMatchObject({
      resultCode: CLIENT_ERROR_CODES.BACKEND_UNAVAILABLE,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>bad gateway</html>", { status: 502 })),
    );
    await expect(createBrowserApi().get("/me")).rejects.toMatchObject({
      status: 502,
      resultCode: CLIENT_ERROR_CODES.INVALID_RESPONSE,
    });
  });
});

describe("자동 리프레시", () => {
  it("401 UNAUTHENTICATED면 리프레시 후 원 요청을 다시 보낸다", async () => {
    const backend = expiringBackend();
    const onSessionExpired = vi.fn();

    const result = await createBrowserApi({ onSessionExpired }).put("/posts/7/draft", {
      body: { title: "t", contentMarkdown: "m" },
    });

    expect(result).toEqual({ id: 7, savedAt: "2026-10-06T04:24:19Z" });
    expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "PUT /api/v1/posts/7/draft",
      REFRESH,
      "PUT /api/v1/posts/7/draft",
    ]);
    expect(backend.calls[2].body).toEqual({ title: "t", contentMarkdown: "m" });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("동시에 401을 받은 요청들은 리프레시 한 번을 함께 기다린다", async () => {
    const backend = expiringBackend();
    const api = createBrowserApi({ onSessionExpired: vi.fn() });

    const results = await Promise.all([
      api.get("/me/blogs"),
      api.put("/posts/7/draft", { body: {} }),
      api.get("/me/blogs"),
    ]);

    expect(results).toHaveLength(3);
    expect(backend.callsTo(REFRESH)).toHaveLength(1);
    expect(backend.callsTo("GET /api/v1/me/blogs")).toHaveLength(4);
  });

  it("리프레시가 401이면 로그인 화면으로 보내고 원 오류를 던진다", async () => {
    const backend = mockBackend({
      "GET /api/v1/me/blogs": fail(401, "UNAUTHENTICATED"),
      [REFRESH]: fail(401, "REFRESH_INVALID"),
    });
    const onSessionExpired = vi.fn();

    await expect(createBrowserApi({ onSessionExpired }).get("/me/blogs")).rejects.toMatchObject({
      status: 401,
      resultCode: "UNAUTHENTICATED",
    });

    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(backend.callsTo(REFRESH)).toHaveLength(1);
    expect(backend.callsTo("GET /api/v1/me/blogs")).toHaveLength(1);
  });

  it("다시 보낸 요청도 401이면 더 리프레시하지 않고 로그인 화면으로", async () => {
    const backend = mockBackend({
      "GET /api/v1/me/blogs": fail(401, "UNAUTHENTICATED"),
      [REFRESH]: ok(null),
    });
    const onSessionExpired = vi.fn();

    await expect(createBrowserApi({ onSessionExpired }).get("/me/blogs")).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(backend.callsTo(REFRESH)).toHaveLength(1);
    expect(backend.callsTo("GET /api/v1/me/blogs")).toHaveLength(2);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("401이라도 UNAUTHENTICATED가 아니거나 /auth 요청이면 리프레시하지 않는다", async () => {
    const backend = mockBackend({
      "POST /api/v1/auth/login": fail(401, "INVALID_CREDENTIALS"),
      "POST /api/v1/auth/logout": fail(401, "UNAUTHENTICATED"),
      "GET /api/v1/me": fail(403, "FORBIDDEN"),
    });
    const onSessionExpired = vi.fn();
    const api = createBrowserApi({ onSessionExpired });

    await expect(api.post("/auth/login", { body: {} })).rejects.toMatchObject({
      resultCode: "INVALID_CREDENTIALS",
    });
    await expect(api.post("/auth/logout")).rejects.toMatchObject({
      resultCode: "UNAUTHENTICATED",
    });
    await expect(api.get("/me")).rejects.toMatchObject({ resultCode: "FORBIDDEN" });

    expect(backend.callsTo(REFRESH)).toHaveLength(0);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });
});

describe("refreshSession", () => {
  it("POST /api/v1/auth/refresh 결과(2xx 여부)를 돌려주고, 끝나면 다음 리프레시를 새로 부른다", async () => {
    const fetchMock = vi.fn(async () => ok(null));

    await expect(refreshSession(fetchMock)).resolves.toBe(true);
    await expect(refreshSession(fetchMock)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/v1/auth/refresh",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    ]);
  });

  it("네트워크 오류는 실패(false)", async () => {
    await expect(
      refreshSession(
        vi.fn(async () => {
          throw new TypeError("offline");
        }),
      ),
    ).resolves.toBe(false);
  });
});

describe("redirectToLogin", () => {
  it("지금 주소를 next로 붙여 /login으로 이동한다", () => {
    const assign = vi.fn();

    redirectToLogin({ pathname: "/marco/write", search: "?x=1", assign });

    expect(assign).toHaveBeenCalledWith("/login?next=%2Fmarco%2Fwrite%3Fx%3D1");
  });
});
