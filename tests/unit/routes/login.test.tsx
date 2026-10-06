// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import Login, { action, loader, meta } from "~/routes/login";
import { action as logoutAction, loader as logoutLoader } from "~/routes/logout";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
} from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type MetaArgs = Parameters<typeof meta>[0];

const LOGIN = "POST /api/v1/auth/login";
const loginResult = {
  userId: 7,
  nickname: "마르코",
  role: "USER",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
};
const authCookies = [
  "access_token=new-access; Path=/; HttpOnly; Secure; SameSite=Lax",
  "refresh_token=new-refresh; Path=/; HttpOnly; Secure; SameSite=Lax",
];

function loginOk() {
  const headers = new Headers();
  for (const cookie of authCookies) headers.append("set-cookie", cookie);
  return ok(loginResult, { headers });
}

describe("login loader", () => {
  it("비로그인이면 같은 사이트 next만 넘긴다", async () => {
    mockBackend();

    await expect(
      loader(routeArgs<LoaderArgs>(getRequest("/login?next=/marco/write"))),
    ).resolves.toEqual({ next: "/marco/write" });
    await expect(
      loader(routeArgs<LoaderArgs>(getRequest("/login?next=https://evil.example/"))),
    ).resolves.toEqual({ next: "/" });
  });

  it("이미 로그인했으면 next로 보낸다", async () => {
    mockBackend({ "GET /api/v1/me": ok({ userId: 7, locale: "ko", blogs: [] }) });

    const thrown = await caught(
      loader(
        routeArgs<LoaderArgs>(
          getRequest("/login?next=/settings/blogs", { cookie: "access_token=a" }),
        ),
      ),
    );

    expect(expectRedirect(thrown)).toBe("/settings/blogs");
  });
});

describe("login action", () => {
  it("성공하면 backend가 준 쿠키를 응답에 싣고 next로 이동한다", async () => {
    const backend = mockBackend({ [LOGIN]: loginOk() });
    const request = formRequest("/login", {
      email: " marco@example.com ",
      password: "secret123",
      next: "/marco/write",
    });

    const result = await action(routeArgs<ActionArgs>(request));

    expect(expectRedirect(result)).toBe("/marco/write");
    expect(backend.calls[0].body).toEqual({ email: "marco@example.com", password: "secret123" });
    expect(backend.calls[0].headers.get("origin")).toBe("http://front.test");
    expect(responseCookies(request)).toEqual(authCookies);
  });

  it("next가 다른 사이트 주소면 첫 화면으로", async () => {
    mockBackend({ [LOGIN]: loginOk() });

    const result = await action(
      routeArgs<ActionArgs>(
        formRequest("/login", { email: "a@b.c", password: "x", next: "//evil.example/x" }),
      ),
    );

    expect(expectRedirect(result)).toBe("/");
  });

  it.each(["INVALID_CREDENTIALS", "ACCOUNT_LOCKED"])("%s는 폼 오류로 돌려준다", async (code) => {
    mockBackend({ [LOGIN]: fail(code === "ACCOUNT_LOCKED" ? 423 : 401, code) });

    const result = asData<{ resultCode: string; values: { email: string } }>(
      await action(
        routeArgs<ActionArgs>(formRequest("/login", { email: "a@b.c", password: "wrong1234" })),
      ),
    );

    expect(result.data.resultCode).toBe(code);
    expect(result.data.values).toEqual({ email: "a@b.c" });
    expect(result.init?.status).toBe(code === "ACCOUNT_LOCKED" ? 423 : 401);
  });

  it("빈 입력은 backend를 부르지 않고 필드 오류", async () => {
    const backend = mockBackend();

    const result = asData<{ fieldErrors: { field: string; code: string }[] }>(
      await action(routeArgs<ActionArgs>(formRequest("/login", { email: " ", password: "" }))),
    );

    expect(backend.calls).toHaveLength(0);
    expect(result.data.fieldErrors).toEqual([
      { field: "email", code: "REQUIRED" },
      { field: "password", code: "REQUIRED" },
    ]);
  });
});

describe("login 화면", () => {
  function renderLogin(entry = "/login?next=/marco/write") {
    return renderRoutes(
      [
        { path: "login", loader, action, Component: Login },
        { path: "marco/write", Component: () => <p>write page</p> },
        { path: "", Component: () => <p>home page</p> },
      ],
      { initialEntries: [entry] },
    );
  }

  it("INVALID_CREDENTIALS 문구를 보여주고 이메일을 다시 채운다", async () => {
    mockBackend({ [LOGIN]: fail(401, "INVALID_CREDENTIALS") });
    renderLogin();

    fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: "a@b.c" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "wrong1234" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이메일 또는 비밀번호가 맞지 않습니다.",
    );
    expect(screen.getByLabelText("이메일")).toHaveValue("a@b.c");
    expect(screen.queryByText(/debug message/)).toBeNull();
  });

  it("ACCOUNT_LOCKED 문구", async () => {
    mockBackend({ [LOGIN]: fail(423, "ACCOUNT_LOCKED") });
    renderLogin();

    fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: "a@b.c" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("10분 뒤에 다시 시도해 주세요.");
  });

  it("성공하면 next 화면으로 이동한다", async () => {
    mockBackend({ [LOGIN]: loginOk() });
    renderLogin();

    fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: "a@b.c" } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "로그인" }));

    expect(await screen.findByText("write page")).toBeInTheDocument();
  });

  it("가입 링크가 있다", async () => {
    mockBackend();
    renderLogin("/login");

    await waitFor(() =>
      expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup"),
    );
  });
});

describe("login meta", () => {
  it("noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("en") }] } as unknown as MetaArgs;
    expect(meta(args)).toEqual(
      expect.arrayContaining([{ title: "Log in - Blog" }, { name: "robots", content: "noindex" }]),
    );
  });
});

describe("logout", () => {
  type LogoutArgs = Parameters<typeof logoutAction>[0];

  it("POST /auth/logout 후 첫 화면으로, backend의 쿠키 삭제를 그대로 싣는다", async () => {
    const cleared = "access_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
    const backend = mockBackend({
      "POST /api/v1/auth/logout": ok(null, { headers: { "set-cookie": cleared } }),
    });
    const request = formRequest("/logout", {}, { cookie: "access_token=a; refresh_token=r" });

    const result = await logoutAction(routeArgs<LogoutArgs>(request));

    expect(expectRedirect(result)).toBe("/");
    expect(backend.calls[0].headers.get("cookie")).toBe("access_token=a; refresh_token=r");
    expect(responseCookies(request)).toEqual([cleared]);
  });

  it("backend가 실패해도 front가 두 쿠키를 지우고 첫 화면으로", async () => {
    mockBackend({ "POST /api/v1/auth/logout": fail(502, "BACKEND_UNAVAILABLE") });
    const request = formRequest("/logout", {}, { cookie: "access_token=a" });

    const result = await logoutAction(routeArgs<LogoutArgs>(request));

    expect(expectRedirect(result)).toBe("/");
    const cookies = responseCookies(request);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^access_token=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax/);
    expect(cookies[1]).toMatch(/^refresh_token=; Path=\/; Max-Age=0; HttpOnly; SameSite=Lax/);
  });

  it("GET /logout은 첫 화면으로", () => {
    expect(expectRedirect(logoutLoader())).toBe("/");
  });
});
