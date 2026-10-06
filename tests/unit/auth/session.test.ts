import { describe, expect, it, vi } from "vitest";

import {
  getSessionUser,
  loginPath,
  requireUser,
  safeNextPath,
  type SessionUser,
} from "~/auth/session.server";
import { ApiError, CLIENT_ERROR_CODES } from "~/api/errors";

const member: SessionUser = {
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
  unseenReleaseNote: null,
};

function envelope(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ok = (result: unknown) =>
  envelope(200, { header: { isSuccessful: true, resultCode: "OK", resultMessage: "" }, result });
const failure = (status: number, resultCode: string) =>
  envelope(status, {
    header: { isSuccessful: false, resultCode, resultMessage: "debug" },
    result: null,
  });

function setup(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response.clone();
  });
}

const request = (url: string, cookie: string | null = "access_token=abc; lang=ko") =>
  new Request(url, { headers: cookie === null ? {} : { cookie } });

const options = (fetchMock: typeof fetch) => ({ baseUrl: "http://backend.test", fetch: fetchMock });

describe("getSessionUser", () => {
  it("/api/v1/me를 쿠키와 함께 불러 회원을 돌려준다", async () => {
    const fetchMock = setup(ok(member));

    const user = await getSessionUser(request("http://front.test/x"), options(fetchMock));

    expect(user).toEqual(member);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("http://backend.test/api/v1/me");
    expect(new Headers(init!.headers).get("cookie")).toBe("access_token=abc; lang=ko");
  });

  it("401이면 비로그인(null)", async () => {
    const fetchMock = setup(failure(401, "UNAUTHENTICATED"));

    await expect(getSessionUser(request("http://front.test/"), options(fetchMock))).resolves.toBe(
      null,
    );
  });

  it("쿠키가 하나도 없으면 backend를 부르지 않고 null", async () => {
    const fetchMock = setup(ok(member));

    await expect(
      getSessionUser(request("http://front.test/", null), options(fetchMock)),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 외의 실패는 그대로 던진다", async () => {
    await expect(
      getSessionUser(request("http://front.test/"), options(setup(failure(500, "INTERNAL_ERROR")))),
    ).rejects.toMatchObject({ status: 500, resultCode: "INTERNAL_ERROR" });
    await expect(
      getSessionUser(request("http://front.test/"), options(setup(new TypeError("down")))),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("requireUser", () => {
  it("로그인 상태면 회원을 돌려준다", async () => {
    await expect(
      requireUser(request("http://front.test/settings"), options(setup(ok(member)))),
    ).resolves.toEqual(member);
  });

  it("비로그인이면 /login?next={현재 경로와 쿼리}로 리다이렉트", async () => {
    const thrown = await requireUser(
      request("http://front.test/marco/manage/posts?status=DRAFT&q=a b"),
      options(setup(failure(401, "UNAUTHENTICATED"))),
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Response);
    const response = thrown as Response;
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!, "http://front.test");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/marco/manage/posts?status=DRAFT&q=a%20b");
  });

  it("backend 장애는 로그인 화면으로 보내지 않고 던진다", async () => {
    await expect(
      requireUser(request("http://front.test/settings"), options(setup(new TypeError("down")))),
    ).rejects.toMatchObject({ resultCode: CLIENT_ERROR_CODES.BACKEND_UNAVAILABLE });
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/marco/12", "/marco/12"],
    ["/marco/manage/posts?status=DRAFT#top", "/marco/manage/posts?status=DRAFT#top"],
    ["/settings/../write", "/write"],
    ["/검색?q=한글", "/%EA%B2%80%EC%83%89?q=%ED%95%9C%EA%B8%80"],
  ])("같은 사이트 상대 경로 %s → %s", (value, expected) => {
    expect(safeNextPath(value)).toBe(expected);
  });

  it.each([
    "https://evil.example/",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "marco/12",
    "",
    "   ",
    null,
    undefined,
  ])("다른 사이트·잘못된 값 %j는 기본값", (value) => {
    expect(safeNextPath(value)).toBe("/");
    expect(safeNextPath(value, "/settings")).toBe("/settings");
  });
});

describe("loginPath", () => {
  it("next를 인코딩해 붙이고, 첫 화면이면 생략한다", () => {
    expect(loginPath("/marco/write?x=1&y=2")).toBe("/login?next=%2Fmarco%2Fwrite%3Fx%3D1%26y%3D2");
    expect(loginPath("/")).toBe("/login");
    expect(loginPath("https://evil.example/")).toBe("/login");
  });
});
