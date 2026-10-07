import { describe, expect, it, vi } from "vitest";

import { API_PREFIX, createApiClient } from "~/api/client.server";
import { ApiError, CLIENT_ERROR_CODES } from "~/api/errors";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

const ok = (result: unknown, extra: Record<string, unknown> = {}) => ({
  header: { isSuccessful: true, resultCode: "OK", resultMessage: "" },
  result,
  ...extra,
});

function setup(response: Response | Error, requestInit: RequestInit = {}) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response.clone();
  });
  const request = new Request("http://front.test/some/page", requestInit);
  const client = createApiClient(request, { baseUrl: "http://backend.test/", fetch: fetchMock });
  return { client, fetchMock };
}

function sentRequest(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [url, init] = fetchMock.mock.calls[0];
  return { url: String(url), init: init!, headers: new Headers(init!.headers) };
}

describe("createApiClient", () => {
  it("result를 꺼내 준다", async () => {
    const { client, fetchMock } = setup(jsonResponse(ok({ id: 1, title: "첫 글" })));

    await expect(client.get("/posts/1")).resolves.toEqual({ id: 1, title: "첫 글" });
    expect(sentRequest(fetchMock).url).toBe(`http://backend.test${API_PREFIX}/posts/1`);
    expect(sentRequest(fetchMock).init.method).toBe("GET");
  });

  it("totalCount, nextCursor, 상태, 응답 헤더를 send로 받을 수 있다", async () => {
    const { client } = setup(
      jsonResponse(ok([{ id: 1 }], { totalCount: 135, nextCursor: "abc" }), {
        status: 201,
        headers: { "set-cookie": "access_token=x; HttpOnly" },
      }),
    );

    const response = await client.send("posts");

    expect(response).toMatchObject({
      result: [{ id: 1 }],
      totalCount: 135,
      nextCursor: "abc",
      status: 201,
    });
    expect(response.headers.get("set-cookie")).toContain("access_token=x");
  });

  it("쿠키·언어·Origin·User-Agent와 X-Request-Id를 backend로 전달한다", async () => {
    const { client, fetchMock } = setup(jsonResponse(ok(null)), {
      method: "POST",
      headers: {
        cookie: "access_token=abc; lang=ko",
        "accept-language": "ko-KR,ko;q=0.9",
        origin: "http://localhost:5173",
        "user-agent": "test-agent",
        "x-request-id": "abcdef1234567890",
        authorization: "Bearer should-not-forward",
      },
    });

    await client.post("/posts/1/publish");

    const { headers, init } = sentRequest(fetchMock);
    expect(init.method).toBe("POST");
    expect(headers.get("cookie")).toBe("access_token=abc; lang=ko");
    expect(headers.get("accept-language")).toBe("ko-KR,ko;q=0.9");
    expect(headers.get("origin")).toBe("http://localhost:5173");
    expect(headers.get("user-agent")).toBe("test-agent");
    expect(headers.get("x-request-id")).toBe("abcdef1234567890");
    expect(headers.get("authorization")).toBeNull();
    expect(client.requestId).toBe("abcdef1234567890");
  });

  it("방문자 주소(X-Forwarded-For)와 원래 scheme(X-Forwarded-Proto)을 backend로 전달한다", async () => {
    // front 서버 미들웨어(server/middleware/forwarded.ts)가 접속 주소를 붙여 둔 값이다.
    const { client, fetchMock } = setup(jsonResponse(ok(null)), {
      headers: { "x-forwarded-for": "203.0.113.7", "x-forwarded-proto": "https" },
    });

    await client.get("/me");

    const { headers } = sentRequest(fetchMock);
    expect(headers.get("x-forwarded-for")).toBe("203.0.113.7");
    expect(headers.get("x-forwarded-proto")).toBe("https");
  });

  it("리프레시 요청에도 방문자 주소를 싣는다", async () => {
    let meCalls = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/auth/refresh")) {
        return jsonResponse(ok(null), { headers: { "set-cookie": "access_token=new; Path=/" } });
      }
      meCalls += 1;
      if (meCalls === 1) {
        return jsonResponse(
          {
            header: { isSuccessful: false, resultCode: "UNAUTHENTICATED", resultMessage: "" },
            result: null,
          },
          { status: 401 },
        );
      }
      return jsonResponse(ok({ id: 7 }));
    });
    const request = new Request("http://front.test/page", {
      headers: { cookie: "refresh_token=r", "x-forwarded-for": "198.51.100.9, 10.0.0.2" },
    });
    const client = createApiClient(request, { baseUrl: "http://backend.test", fetch: fetchMock });

    await expect(client.get("/me")).resolves.toEqual({ id: 7 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init!.headers).get("x-forwarded-for")).toBe("198.51.100.9, 10.0.0.2");
    }
  });

  it("들어온 X-Request-Id가 없거나 형식이 틀리면 새로 만든다", async () => {
    const { client, fetchMock } = setup(jsonResponse(ok(null)), {
      headers: { "x-request-id": "bad id!" },
    });

    await client.get("/me");

    expect(client.requestId).toMatch(/^[0-9a-f]{16}$/);
    expect(sentRequest(fetchMock).headers.get("x-request-id")).toBe(client.requestId);
  });

  it("본문은 JSON으로, 쿼리는 쉼표로 이어 보낸다", async () => {
    const { client, fetchMock } = setup(jsonResponse(ok({ id: 2 })));

    await client.patch("/posts/2", {
      body: { title: "새 제목" },
      query: { status: ["DRAFT", "SCHEDULED"], page: 0, q: undefined, empty: null },
    });

    const { url, init, headers } = sentRequest(fetchMock);
    expect(new URL(url).searchParams.get("status")).toBe("DRAFT,SCHEDULED");
    expect(new URL(url).searchParams.get("page")).toBe("0");
    expect(new URL(url).searchParams.has("q")).toBe(false);
    expect(new URL(url).searchParams.has("empty")).toBe(false);
    expect(init.body).toBe(JSON.stringify({ title: "새 제목" }));
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("FormData는 그대로 보낸다", async () => {
    const { client, fetchMock } = setup(jsonResponse(ok(null)));
    const form = new FormData();
    form.set("file", "x");

    await client.put("/me/avatar", { body: form });
    await client.delete("/me/avatar");

    expect(fetchMock.mock.calls[0][1]!.body).toBe(form);
    expect(fetchMock.mock.calls[1][1]!.method).toBe("DELETE");
  });

  it("isSuccessful=false면 상태·코드·필드 오류·traceId를 담은 ApiError를 던진다", async () => {
    const { client } = setup(
      jsonResponse(
        {
          header: {
            isSuccessful: false,
            resultCode: "VALIDATION_FAILED",
            resultMessage: "Validation failed",
            fieldErrors: [{ field: "title", code: "REQUIRED", params: {} }],
            traceId: "4bf92f3577b34da6",
          },
          result: null,
        },
        { status: 400 },
      ),
    );

    const error = await client.post("/posts", { body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      resultCode: "VALIDATION_FAILED",
      resultMessage: "Validation failed",
      fieldErrors: [{ field: "title", code: "REQUIRED", params: {} }],
      traceId: "4bf92f3577b34da6",
    });
  });

  it("Retry-After(초)를 ApiError에 담는다(004 비밀번호 시도 제한)", async () => {
    const failure = (retryAfter?: string) =>
      jsonResponse(
        {
          header: {
            isSuccessful: false,
            resultCode: "PASSWORD_ATTEMPTS_EXCEEDED",
            resultMessage: "",
          },
          result: null,
        },
        { status: 429, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } },
      );

    const withHeader = await setup(failure("540"))
      .client.post("/posts/1/unlock")
      .catch((e: unknown) => e);
    const withoutHeader = await setup(failure())
      .client.post("/posts/1/unlock")
      .catch((e: unknown) => e);
    const httpDate = await setup(failure("Wed, 21 Oct 2026 07:28:00 GMT"))
      .client.post("/posts/1/unlock")
      .catch((e: unknown) => e);

    expect(withHeader).toMatchObject({ status: 429, retryAfter: 540 });
    expect(withoutHeader).toMatchObject({ retryAfter: null });
    expect(httpDate).toMatchObject({ retryAfter: null });
  });

  it("같은 요청의 GET /blogs/{handle}은 한 번만 보내고, 상태를 바꾸면 다시 부른다(004 요청 메모)", async () => {
    const { client, fetchMock } = setup(jsonResponse(ok({ handle: "marco" })));

    const [first, second] = await Promise.all([
      client.get("/blogs/marco"),
      client.get("/blogs/marco"),
    ]);
    await client.get("/blogs/marco/posts");
    await client.get("/blogs/marco", { query: { page: 1 } });

    expect(first).toEqual({ handle: "marco" });
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await client.post("/blogs/marco/visits");
    await client.get("/blogs/marco");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("다른 요청끼리는 메모를 나누지 않는다", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(ok({ handle: "marco" })));
    const options = { baseUrl: "http://backend.test", fetch: fetchMock };

    await createApiClient(new Request("http://front.test/a"), options).get("/blogs/marco");
    await createApiClient(new Request("http://front.test/b"), options).get("/blogs/marco");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("traceId가 없으면 응답 헤더 X-Request-Id를 쓴다", async () => {
    const { client } = setup(
      jsonResponse(
        {
          header: { isSuccessful: false, resultCode: "POST_NOT_FOUND", resultMessage: "" },
          result: null,
        },
        { status: 404, headers: { "x-request-id": "fedcba9876543210" } },
      ),
    );

    await expect(client.get("/posts/9")).rejects.toMatchObject({
      status: 404,
      resultCode: "POST_NOT_FOUND",
      fieldErrors: [],
      traceId: "fedcba9876543210",
    });
  });

  it("공통 틀이 아닌 응답은 INVALID_RESPONSE", async () => {
    const { client } = setup(new Response("<html>bad gateway</html>", { status: 503 }));

    await expect(client.get("/me")).rejects.toMatchObject({
      status: 503,
      resultCode: CLIENT_ERROR_CODES.INVALID_RESPONSE,
    });
  });

  it("2xx가 아닌데 isSuccessful=true면 INVALID_RESPONSE", async () => {
    const { client } = setup(jsonResponse(ok(null), { status: 500 }));

    await expect(client.get("/me")).rejects.toMatchObject({
      status: 500,
      resultCode: CLIENT_ERROR_CODES.INVALID_RESPONSE,
    });
  });

  it("2xx인데 isSuccessful=false면 502로 본다", async () => {
    const { client } = setup(
      jsonResponse({
        header: { isSuccessful: false, resultCode: "X", resultMessage: "" },
        result: null,
      }),
    );

    await expect(client.get("/me")).rejects.toMatchObject({ status: 502, resultCode: "X" });
  });

  it("backend에 연결하지 못하면 BACKEND_UNAVAILABLE", async () => {
    const { client } = setup(new TypeError("fetch failed"));

    await expect(client.get("/me")).rejects.toMatchObject({
      status: 502,
      resultCode: CLIENT_ERROR_CODES.BACKEND_UNAVAILABLE,
      resultMessage: "fetch failed",
    });
  });

  it("기본 backend 주소는 BLOG_BACKEND_URL", async () => {
    vi.stubEnv("BLOG_BACKEND_URL", "http://env-backend.test:9090/");
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(ok(1)));
    try {
      await createApiClient(new Request("http://front.test/"), { fetch: fetchMock }).get("me");
      expect(String(fetchMock.mock.calls[0][0])).toBe("http://env-backend.test:9090/api/v1/me");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
