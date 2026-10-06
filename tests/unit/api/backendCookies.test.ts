import { RouterContextProvider, createStaticHandler, redirect } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  addResponseCookie,
  backendSession,
  forwardBackendCookies,
  hasCookie,
  mergeCookieHeader,
  recordSetCookies,
  responseCookies,
  withSetCookies,
} from "~/api/backendCookies.server";

describe("mergeCookieHeader", () => {
  it("Set-Cookie 값을 Cookie 헤더에 덮어쓰고 새 이름은 더한다", () => {
    expect(
      mergeCookieHeader("access_token=old; lang=ko", [
        "access_token=new; Path=/; HttpOnly",
        "refresh_token=r2; Path=/; HttpOnly; Secure",
      ]),
    ).toBe("access_token=new; lang=ko; refresh_token=r2");
  });

  it("Max-Age=0이나 지난 Expires는 지운다", () => {
    expect(
      mergeCookieHeader("access_token=a; refresh_token=r; lang=ko", [
        "access_token=; Path=/; Max-Age=0",
        "refresh_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      ]),
    ).toBe("lang=ko");
    expect(mergeCookieHeader("a=1", ["a=; Max-Age=0"])).toBeNull();
  });

  it("앞으로의 Expires는 유지하고, 모양이 틀린 값은 무시한다", () => {
    expect(
      mergeCookieHeader(null, ["v=1; Expires=Fri, 01 Jan 2100 00:00:00 GMT", "broken", "=x"]),
    ).toBe("v=1");
  });
});

describe("backendSession", () => {
  it("요청마다 하나이고, 받은 Set-Cookie를 다음 호출의 쿠키에 반영한다(같은 값은 한 번만)", () => {
    const request = new Request("http://front.test/", { headers: { cookie: "access_token=a" } });
    const session = backendSession(request);

    recordSetCookies(session, ["access_token=b; Path=/"]);
    recordSetCookies(session, ["access_token=b; Path=/"]);
    addResponseCookie(request, "last_blog=marco; Path=/");

    expect(backendSession(request)).toBe(session);
    expect(session.cookie).toBe("access_token=b; last_blog=marco");
    expect(responseCookies(request)).toEqual(["access_token=b; Path=/", "last_blog=marco; Path=/"]);
    expect(responseCookies(new Request("http://front.test/"))).toEqual([]);
  });

  it("hasCookie", () => {
    expect(hasCookie("a=1; refresh_token=r", "refresh_token")).toBe(true);
    expect(hasCookie("a=1", "refresh_token")).toBe(false);
    expect(hasCookie(null, "refresh_token")).toBe(false);
  });
});

describe("withSetCookies", () => {
  it("응답 헤더에 더한다", () => {
    const response = withSetCookies(new Response("x"), ["a=1", "b=2"]);
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });

  it("없으면 그대로", () => {
    const response = new Response("x");
    expect(withSetCookies(response, [])).toBe(response);
  });

  it("헤더를 바꿀 수 없는 응답은 복사해서 더한다", async () => {
    const immutable = new Response("body", { status: 201, statusText: "Created" });
    vi.spyOn(immutable.headers, "append").mockImplementation(() => {
      throw new TypeError("immutable");
    });

    const result = withSetCookies(immutable, ["a=1"]);

    expect(result).not.toBe(immutable);
    expect(result.status).toBe(201);
    expect(result.headers.getSetCookie()).toEqual(["a=1"]);
    expect(await result.text()).toBe("body");
  });
});

describe("forwardBackendCookies 미들웨어", () => {
  // 프레임워크 서버처럼 root 미들웨어 → loader 순서로 실행해, loader가 모은 쿠키가 응답에 실리는지 본다.
  function handler(loader: (args: { request: Request }) => unknown) {
    return createStaticHandler([
      {
        id: "root",
        path: "/",
        // 프레임워크 서버의 미들웨어는 Response를 돌려준다(정적 핸들러 타입은 unknown).
        middleware: [forwardBackendCookies as never],
        children: [{ id: "page", path: "page", loader }],
      },
    ]);
  }

  async function query(loader: (args: { request: Request }) => unknown) {
    const request = new Request("http://front.test/page");
    return handler(loader).query(request, {
      requestContext: new RouterContextProvider(),
      generateMiddlewareResponse: async (run) => {
        const context = await run(request);
        if (context instanceof Response) {
          return context;
        }
        return new Response("page", { status: context.statusCode });
      },
    }) as Promise<Response>;
  }

  it("loader에서 모은 Set-Cookie를 문서 응답에 싣는다", async () => {
    const response = await query(({ request }) => {
      addResponseCookie(request, "access_token=new; Path=/; HttpOnly");
      return null;
    });

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(["access_token=new; Path=/; HttpOnly"]);
  });

  it("리다이렉트 응답에도 싣는다", async () => {
    const response = await query(({ request }) => {
      addResponseCookie(request, "access_token=new; Path=/");
      throw redirect("/elsewhere");
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/elsewhere");
    expect(response.headers.getSetCookie()).toEqual(["access_token=new; Path=/"]);
  });
});
