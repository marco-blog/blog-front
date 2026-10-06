// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Settings, { loader as settingsLoader } from "~/routes/settings";
import SettingsLoginHistory, {
  loader as historyLoader,
  meta as historyMeta,
} from "~/routes/settings.login-history";
import SettingsPassword, {
  action as passwordAction,
  loader as passwordLoader,
  meta as passwordMeta,
} from "~/routes/settings.password";
import SettingsProfile, {
  action as profileAction,
  loader as profileLoader,
  meta as profileMeta,
} from "~/routes/settings.profile";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  withCookie,
} from "../support/route";

const me = {
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: "자바 이야기",
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
  unseenReleaseNote: null,
};

const loggedIn = { cookie: "access_token=a" };

function metaArgs(language: "ko" | "en" = "ko") {
  return { matches: [{ id: "root", loaderData: rootData(language) }] } as never;
}

describe("계정 설정 화면은 로그인이 필요하다", () => {
  it.each([
    ["/settings/profile", profileLoader],
    ["/settings/password", passwordLoader],
    ["/settings/login-history", historyLoader],
  ] as const)("%s", async (path, loader) => {
    mockBackend({ "GET /api/v1/me": fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(loader(routeArgs(getRequest(path, { cookie: "x=1" })) as never)),
    );

    expect(location).toBe(`/login?next=${encodeURIComponent(path)}`);
  });

  it("action도 로그인이 필요하다", async () => {
    mockBackend({ "GET /api/v1/me": fail(401, "UNAUTHENTICATED") });

    expect(
      expectRedirect(
        await caught(
          profileAction(
            routeArgs(formRequest("/settings/profile", { intent: "profile" }, { cookie: "x=1" })),
          ),
        ),
      ),
    ).toMatch(/^\/login\?next=/);
    expect(
      expectRedirect(
        await caught(
          passwordAction(routeArgs(formRequest("/settings/password", {}, { cookie: "x=1" }))),
        ),
      ),
    ).toMatch(/^\/login\?next=/);
  });

  it("모두 noindex", () => {
    expect(profileMeta(metaArgs())).toEqual([
      { title: "프로필 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
    expect(passwordMeta(metaArgs("en"))).toEqual([
      { title: "Change password - Blog" },
      { name: "robots", content: "noindex" },
    ]);
    expect(historyMeta(metaArgs())).toEqual([
      { title: "로그인 기록 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

function renderSettings(
  path: string,
  child: Parameters<typeof renderRoutes>[0][number],
  routes: Record<string, BackendHandler | Response> = {},
) {
  const backend = mockBackend({ "GET /api/v1/me": ok(me), ...routes });
  renderRoutes(
    [
      {
        path: "settings",
        loader: withCookie(settingsLoader),
        Component: Settings,
        children: [child],
      },
      { path: "login", Component: () => <p>로그인 화면</p> },
      { index: true, Component: () => <p>첫 화면</p> },
    ],
    { initialEntries: [path] },
  );
  return backend;
}

describe("/settings/profile", () => {
  const route = {
    path: "profile",
    loader: withCookie(profileLoader),
    action: withCookie(profileAction),
    Component: SettingsProfile,
  };

  it("loader는 /me의 닉네임·소개·이메일", async () => {
    mockBackend({ "GET /api/v1/me": ok(me) });
    await expect(
      profileLoader(routeArgs(getRequest("/settings/profile", loggedIn)) as never),
    ).resolves.toEqual({
      email: "marco@example.com",
      nickname: "마르코",
      bio: "자바 이야기",
      profileImageUrl: null,
    });
  });

  it("설정 메뉴: 프로필·비밀번호·로그인 기록·내 블로그·언어", async () => {
    renderSettings("/settings/profile", route);

    const nav = await screen.findByRole("navigation", { name: "계정 설정 메뉴" });
    expect(within(nav).getByRole("link", { name: "프로필" })).toHaveAttribute(
      "href",
      "/settings/profile",
    );
    expect(within(nav).getByRole("link", { name: "비밀번호 변경" })).toHaveAttribute(
      "href",
      "/settings/password",
    );
    expect(within(nav).getByRole("link", { name: "로그인 기록" })).toHaveAttribute(
      "href",
      "/settings/login-history",
    );
    expect(within(nav).getByRole("link", { name: "내 블로그" })).toHaveAttribute(
      "href",
      "/settings/blogs",
    );
    expect(within(nav).getByRole("link", { name: "언어·시간대" })).toHaveAttribute(
      "href",
      "/settings/language",
    );
  });

  it("닉네임·소개 저장: 보낸 값으로 PATCH /me", async () => {
    let current = me;
    const backend = mockBackend({
      "GET /api/v1/me": () => ok(current),
      "PATCH /api/v1/me": (call) => {
        current = { ...me, ...(call.body as object) };
        return ok(current);
      },
    });
    renderRoutes(
      [
        {
          path: "settings",
          loader: withCookie(settingsLoader),
          Component: Settings,
          children: [route],
        },
      ],
      { initialEntries: ["/settings/profile"] },
    );

    const nickname = await screen.findByLabelText("닉네임");
    expect(nickname).toHaveValue("마르코");
    expect(screen.getByLabelText("소개")).toHaveValue("자바 이야기");
    expect(screen.getByText("marco@example.com")).toBeInTheDocument();
    fireEvent.change(nickname, { target: { value: " 새 닉네임 " } });
    fireEvent.change(screen.getByLabelText("소개"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("status")).toHaveTextContent("프로필을 저장했습니다.");
    expect(backend.callsTo("PATCH /api/v1/me")[0].body).toEqual({
      nickname: "새 닉네임",
      bio: null,
    });
    expect(screen.getByLabelText("닉네임")).toHaveValue("새 닉네임");
  });

  it("프로필 이미지: 고르면 purpose=PROFILE로 올려 미리 보고, 저장할 때 키를 보낸다. 지우면 null", async () => {
    const key = "k3Jd9fQ2xLmA7pZ0bR5tYw";
    let current: Omit<typeof me, "profileImageUrl"> & { profileImageUrl: string | null } = me;
    const backend = mockBackend({
      "GET /api/v1/me": () => ok(current),
      "POST /api/v1/media": ok(
        { key, url: `/media/${key}`, mime: "image/png", size: 68, width: 1, height: 1 },
        { status: 201 },
      ),
      "PATCH /api/v1/me": (call) => {
        const body = call.body as { profileImageMediaKey?: string | null };
        current = {
          ...me,
          profileImageUrl: body.profileImageMediaKey ? `/media/${body.profileImageMediaKey}` : null,
        };
        return ok(current);
      },
    });
    renderRoutes(
      [
        {
          path: "settings",
          loader: withCookie(settingsLoader),
          Component: Settings,
          children: [route],
        },
      ],
      { initialEntries: ["/settings/profile"] },
    );

    expect(await screen.findByText("이미지가 없습니다.")).toBeInTheDocument();
    const file = new File([new Uint8Array(68)], "me.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("이미지 파일 고르기"), { target: { files: [file] } });

    const preview = await screen.findByRole("img", { name: "프로필 이미지 미리보기" });
    expect(preview).toHaveAttribute("src", `/media/${key}/100x100`);
    expect(screen.getByText("저장해야 반영됩니다.")).toBeInTheDocument();
    const upload = backend.callsTo("POST /api/v1/media")[0].body as FormData;
    expect(upload.get("purpose")).toBe("PROFILE");

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("프로필을 저장했습니다.")).toBeInTheDocument();
    expect(backend.callsTo("PATCH /api/v1/me")[0].body).toEqual({
      nickname: "마르코",
      bio: "자바 이야기",
      profileImageMediaKey: key,
    });
    expect(screen.queryByText("저장해야 반영됩니다.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "이미지 지우기" }));
    expect(screen.getByText("이미지가 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await vi.waitFor(() => expect(backend.callsTo("PATCH /api/v1/me")).toHaveLength(2));
    expect(backend.callsTo("PATCH /api/v1/me")[1].body).toEqual({
      nickname: "마르코",
      bio: "자바 이야기",
      profileImageMediaKey: null,
    });
  });

  it("프로필 이미지: 올리기 실패와 저장 시 backend 오류를 이미지 칸에 보인다", async () => {
    const backend = renderSettings("/settings/profile", route, {
      "POST /api/v1/media": fail(415, "MEDIA_TYPE_NOT_ALLOWED"),
      "PATCH /api/v1/me": fail(400, "VALIDATION_FAILED", [
        { field: "profileImageMediaKey", code: "INVALID" },
      ]),
    });
    const file = new File(["not an image"], "fake.jpg", { type: "image/jpeg" });

    fireEvent.change(await screen.findByLabelText("이미지 파일 고르기"), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText("JPEG, PNG, GIF, WebP 이미지만 올릴 수 있습니다."),
    ).toBeInTheDocument();
    expect(backend.callsTo("POST /api/v1/media")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText("올바르지 않은 값입니다.")).toBeInTheDocument();
  });

  it("빈 닉네임은 backend를 부르지 않고 필수 문구", async () => {
    const backend = renderSettings("/settings/profile", route);

    fireEvent.change(await screen.findByLabelText("닉네임"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByText("필수 입력 항목입니다.")).toBeInTheDocument();
    expect(backend.callsTo("PATCH /api/v1/me")).toHaveLength(0);
  });

  it("backend 검증 오류는 입력란에", async () => {
    renderSettings("/settings/profile", route, {
      "PATCH /api/v1/me": fail(400, "VALIDATION_FAILED", [
        { field: "bio", code: "TOO_LONG", params: { max: 300 } },
      ]),
    });

    fireEvent.click(await screen.findByRole("button", { name: "저장" }));

    expect(await screen.findByText("300자 이하로 입력해 주세요.")).toBeInTheDocument();
  });

  it("탈퇴: 확인 대화상자에서 비밀번호 확인 후 DELETE /me, 첫 화면으로", async () => {
    const backend = renderSettings("/settings/profile", route, {
      "DELETE /api/v1/me": ok(null, {
        headers: { "set-cookie": "access_token=; Path=/; Max-Age=0" },
      }),
    });

    const section = within(
      (await screen.findByText("회원 탈퇴", { selector: "summary" })).closest("details")!,
    );
    expect(section.getByText(/탈퇴하면 되돌릴 수 없습니다/)).toBeInTheDocument();
    const password = section.getByLabelText("비밀번호 확인");
    expect(password).toBeRequired();
    fireEvent.change(password, { target: { value: "password1" } });
    fireEvent.click(section.getByRole("button", { name: "탈퇴하기" }));

    expect(await screen.findByText("첫 화면")).toBeInTheDocument();
    expect(backend.callsTo("DELETE /api/v1/me")[0].body).toEqual({ password: "password1" });
  });

  it("탈퇴: 비밀번호가 틀리면 CURRENT_PASSWORD_MISMATCH 문구", async () => {
    renderSettings("/settings/profile", route, {
      "DELETE /api/v1/me": fail(400, "CURRENT_PASSWORD_MISMATCH"),
    });

    const section = within(
      (await screen.findByText("회원 탈퇴", { selector: "summary" })).closest("details")!,
    );
    fireEvent.change(section.getByLabelText("비밀번호 확인"), { target: { value: "wrong" } });
    fireEvent.click(section.getByRole("button", { name: "탈퇴하기" }));

    expect(await section.findByText("비밀번호가 맞지 않습니다.")).toBeInTheDocument();
  });

  it("탈퇴: 빈 비밀번호는 400, 알 수 없는 intent도 400", async () => {
    mockBackend({ "GET /api/v1/me": ok(me) });

    const empty = asData(
      await profileAction(
        routeArgs(formRequest("/settings/profile", { intent: "withdraw", password: "" }, loggedIn)),
      ),
    );
    expect(empty.init?.status).toBe(400);
    const unknown = asData(
      await profileAction(routeArgs(formRequest("/settings/profile", { intent: "x" }, loggedIn))),
    );
    expect(unknown.init?.status).toBe(400);
  });
});

describe("/settings/password", () => {
  const route = {
    path: "password",
    loader: withCookie(passwordLoader),
    action: withCookie(passwordAction),
    Component: SettingsPassword,
  };

  async function submit(current: string, next: string, confirm = next) {
    fireEvent.change(await screen.findByLabelText("현재 비밀번호"), {
      target: { value: current },
    });
    fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: next } });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: confirm } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
  }

  it("현재 비밀번호가 틀리면 CURRENT_PASSWORD_MISMATCH 문구(현재 비밀번호 입력란)", async () => {
    renderSettings("/settings/password", route, {
      "PUT /api/v1/me/password": fail(400, "CURRENT_PASSWORD_MISMATCH"),
    });

    await submit("wrong1234", "newPassword1");

    const current = screen.getByLabelText("현재 비밀번호");
    expect(await screen.findByText("비밀번호가 맞지 않습니다.")).toBeInTheDocument();
    expect(current).toHaveAttribute("aria-invalid", "true");
  });

  it("성공: PUT /me/password, 다른 기기 로그아웃 안내", async () => {
    const backend = renderSettings("/settings/password", route, {
      "PUT /api/v1/me/password": ok(null),
    });

    await submit("password1", "newPassword1");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "비밀번호를 바꿨습니다. 다른 기기에서는 로그아웃되었습니다.",
    );
    expect(backend.callsTo("PUT /api/v1/me/password")[0].body).toEqual({
      currentPassword: "password1",
      newPassword: "newPassword1",
    });
  });

  it("새 비밀번호 확인이 다르면 backend를 부르지 않는다", async () => {
    const backend = renderSettings("/settings/password", route);

    await submit("password1", "newPassword1", "newPassword2");

    expect(await screen.findByText("새 비밀번호가 서로 다릅니다.")).toBeInTheDocument();
    expect(backend.callsTo("PUT /api/v1/me/password")).toHaveLength(0);
  });

  it("빈 입력은 필수 문구", async () => {
    mockBackend({ "GET /api/v1/me": ok(me) });

    const result = asData<{ fieldErrors: unknown[] }>(
      await passwordAction(routeArgs(formRequest("/settings/password", {}, loggedIn))),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.fieldErrors).toEqual([
      { field: "currentPassword", code: "REQUIRED" },
      { field: "newPassword", code: "REQUIRED" },
      { field: "newPasswordConfirm", code: "REQUIRED" },
    ]);
  });
});

describe("/settings/login-history", () => {
  const route = {
    path: "login-history",
    loader: withCookie(historyLoader),
    Component: SettingsLoginHistory,
  };

  const item = (n: number, success: boolean) => ({
    at: `2026-10-06T0${n}:00:00Z`,
    success,
    ipMasked: n % 2 ? "211.234.*.*" : "2001:db8:85a3::*",
    device: n === 3 ? null : `Mozilla/5.0 (${n})`,
  });

  it("loader: 주소의 page(1부터)를 0부터로 바꿔 부르고 전체 개수를 받는다", async () => {
    const backend = mockBackend({
      "GET /api/v1/me": ok(me),
      "GET /api/v1/me/login-history": ok([item(1, true)], { totalCount: 41 }),
    });

    const data = await historyLoader(
      routeArgs(getRequest("/settings/login-history?page=3", loggedIn)) as never,
    );

    expect(data).toEqual({ items: [item(1, true)], totalCount: 41, page: 3, pageSize: 20 });
    expect(backend.callsTo("GET /api/v1/me/login-history")[0].url.searchParams.get("page")).toBe(
      "2",
    );
  });

  it("잘못된 page는 첫 페이지", async () => {
    const backend = mockBackend({
      "GET /api/v1/me": ok(me),
      "GET /api/v1/me/login-history": ok([], { totalCount: 0 }),
    });

    await historyLoader(
      routeArgs(getRequest("/settings/login-history?page=-2", loggedIn)) as never,
    );

    expect(backend.callsTo("GET /api/v1/me/login-history")[0].url.searchParams.get("page")).toBe(
      "0",
    );
  });

  it("시각·성공 여부·가린 IP·기기, 페이지 이동", async () => {
    renderSettings("/settings/login-history", route, {
      "GET /api/v1/me/login-history": ok([item(3, false), item(2, true)], { totalCount: 25 }),
    });

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(
      within(rows[0])
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["시각", "결과", "IP", "기기"]);
    expect(within(rows[1]).getByText("실패")).toBeInTheDocument();
    expect(within(rows[1]).getByText("211.234.*.*")).toBeInTheDocument();
    expect(within(rows[1]).getByText("알 수 없음")).toBeInTheDocument();
    expect(within(rows[1]).getByText(/2026년 10월 6일/)).toBeInTheDocument();
    expect(within(rows[2]).getByText("성공")).toBeInTheDocument();
    expect(within(rows[2]).getByText("2001:db8:85a3::*")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Mozilla/5.0 (2)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute(
      "href",
      "/settings/login-history?page=2",
    );
  });

  it("기록이 없으면 안내", async () => {
    renderSettings("/settings/login-history", route, {
      "GET /api/v1/me/login-history": ok([], { totalCount: 0 }),
    });

    expect(await screen.findByText("로그인 기록이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
