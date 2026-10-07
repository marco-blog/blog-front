// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Settings, { loader as settingsLoader } from "~/routes/settings";
import SettingsBlogs, { action, loader, meta } from "~/routes/settings.blogs";
import { loader as settingsIndexLoader } from "~/routes/settings._index";

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

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type MetaArgs = Parameters<typeof meta>[0];

const me = {
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

const myBlogs = (handles: string[], limit = 3) => ({
  items: handles.map((handle, i) => ({
    handle,
    title: `${handle} 블로그`,
    coverImageUrl: null,
    postCount: i * 2,
    createdAt: "2026-10-06T04:24:19Z",
  })),
  count: handles.length,
  limit,
});

const loggedIn = { cookie: "access_token=a" };

describe("settings 레이아웃", () => {
  it("로그인이 필요하다", async () => {
    mockBackend({ "GET /api/v1/me": fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(
        settingsLoader(
          routeArgs<Parameters<typeof settingsLoader>[0]>(
            getRequest("/settings/blogs", { cookie: "x=1" }),
          ),
        ),
      ),
    );

    expect(location).toBe("/login?next=%2Fsettings%2Fblogs");
  });

  it("/settings는 /settings/profile로", () => {
    expect(expectRedirect(settingsIndexLoader())).toBe("/settings/profile");
  });
});

describe("settings/blogs loader", () => {
  it("/me/blogs의 목록·수·한도", async () => {
    const data = myBlogs(["marco", "marco-dev"]);
    mockBackend({ "GET /api/v1/me": ok(me), "GET /api/v1/me/blogs": ok(data) });

    await expect(
      loader(routeArgs<LoaderArgs>(getRequest("/settings/blogs", loggedIn))),
    ).resolves.toEqual({ blogs: data });
  });
});

describe("settings/blogs action", () => {
  it("만들기: 주소·제목으로 POST /blogs", async () => {
    const backend = mockBackend({
      "GET /api/v1/me": ok(me),
      "POST /api/v1/blogs": ok({ handle: "marco-dev", title: "개발" }, { status: 201 }),
    });

    const result = asData(
      await action(
        routeArgs<ActionArgs>(
          formRequest(
            "/settings/blogs",
            { intent: "create", handle: " marco-dev ", title: "개발" },
            loggedIn,
          ),
        ),
      ),
    );

    expect(result.data).toEqual({ intent: "create", ok: true, handle: "marco-dev" });
    expect(backend.callsTo("POST /api/v1/blogs")[0].body).toEqual({
      handle: "marco-dev",
      title: "개발",
    });
  });

  it("만들기: 제목을 비우면 보내지 않는다(backend 기본값)", async () => {
    const backend = mockBackend({
      "GET /api/v1/me": ok(me),
      "POST /api/v1/blogs": ok({ handle: "marco-dev" }, { status: 201 }),
    });

    await action(
      routeArgs<ActionArgs>(
        formRequest(
          "/settings/blogs",
          { intent: "create", handle: "marco-dev", title: " " },
          loggedIn,
        ),
      ),
    );

    expect(backend.callsTo("POST /api/v1/blogs")[0].body).toEqual({ handle: "marco-dev" });
  });

  it("삭제: 비밀번호와 함께 DELETE /blogs/{handle}", async () => {
    const backend = mockBackend({
      "GET /api/v1/me": ok(me),
      "DELETE /api/v1/blogs/marco-dev": ok(null),
    });

    const result = asData(
      await action(
        routeArgs<ActionArgs>(
          formRequest(
            "/settings/blogs",
            { intent: "delete", handle: "marco-dev", password: "secret123" },
            loggedIn,
          ),
        ),
      ),
    );

    expect(result.data).toEqual({ intent: "delete", ok: true, handle: "marco-dev" });
    expect(backend.callsTo("DELETE /api/v1/blogs/marco-dev")[0].body).toEqual({
      password: "secret123",
    });
  });

  it("알 수 없는 intent는 400", async () => {
    mockBackend({ "GET /api/v1/me": ok(me) });

    const result = asData(
      await action(
        routeArgs<ActionArgs>(formRequest("/settings/blogs", { intent: "x" }, loggedIn)),
      ),
    );

    expect(result.init?.status).toBe(400);
  });
});

describe("settings/blogs 화면", () => {
  function renderPage(
    routes: Record<string, BackendHandler | Response>,
    handles = ["marco", "marco-dev"],
  ) {
    let current = myBlogs(handles);
    const backend = mockBackend({
      "GET /api/v1/me": ok(me),
      "GET /api/v1/me/blogs": () => ok(current),
      ...routes,
    });
    renderRoutes(
      [
        {
          path: "settings",
          loader: withCookie(settingsLoader),
          Component: Settings,
          children: [
            {
              path: "blogs",
              loader: withCookie(loader),
              action: withCookie(action),
              Component: SettingsBlogs,
            },
          ],
        },
      ],
      { initialEntries: ["/settings/blogs"] },
    );
    return {
      backend,
      setBlogs: (next: string[], limit = 3) => {
        current = myBlogs(next, limit);
      },
    };
  }

  it("블로그 목록, 블로그 수 / 한도, 각 블로그의 보기·관리·글쓰기 바로가기", async () => {
    renderPage({});

    expect(await screen.findByText("블로그 2 / 3")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "계정 설정 메뉴" })).toHaveTextContent(
      "내 블로그",
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const first = within(items[0]);
    expect(first.getByRole("link", { name: "marco 블로그" })).toHaveAttribute("href", "/marco");
    expect(first.getByRole("link", { name: "관리" })).toHaveAttribute("href", "/marco/manage");
    expect(first.getByRole("link", { name: "글쓰기" })).toHaveAttribute("href", "/marco/write");
    expect(first.getByText("/marco")).toBeInTheDocument();
    expect(within(items[1]).getByText("글 2")).toBeInTheDocument();
  });

  it("블로그가 하나뿐이면 삭제 버튼이 없다", async () => {
    renderPage({}, ["marco"]);

    expect(await screen.findByText("블로그 1 / 3")).toBeInTheDocument();
    expect(screen.queryByText("블로그 삭제")).toBeNull();
  });

  it.each([
    ["BLOG_LIMIT_EXCEEDED", 409, "만들 수 있는 블로그 수를 넘었습니다."],
    ["HANDLE_TAKEN", 409, "이미 사용 중인 주소입니다."],
    ["HANDLE_RESERVED", 422, "사용할 수 없는 주소입니다."],
  ])("만들기 실패 %s 문구", async (code, status, message) => {
    renderPage({
      "POST /api/v1/blogs": fail(status, code),
      "GET /api/v1/auth/handle-availability": ok({ available: true }),
    });

    const form = (await screen.findByRole("heading", { name: "새 블로그 만들기" })).closest(
      "form",
    )!;
    fireEvent.change(within(form).getByLabelText("블로그 주소"), { target: { value: "admin" } });
    fireEvent.click(within(form).getByRole("button", { name: "만들기" }));

    expect(await within(form).findByText(message)).toBeInTheDocument();
  });

  it("주소·제목 금칙어(BANNED_WORD, 005)는 각 입력란에", async () => {
    renderPage({
      "POST /api/v1/blogs": fail(400, "VALIDATION_FAILED", [
        { field: "handle", code: "BANNED_WORD" },
        { field: "title", code: "BANNED_WORD" },
      ]),
      "GET /api/v1/auth/handle-availability": ok({ available: true }),
    });

    const form = (await screen.findByRole("heading", { name: "새 블로그 만들기" })).closest(
      "form",
    )!;
    fireEvent.change(within(form).getByLabelText("블로그 주소"), { target: { value: "spam-x" } });
    fireEvent.change(within(form).getByLabelText("블로그 제목"), { target: { value: "광고" } });
    fireEvent.click(within(form).getByRole("button", { name: "만들기" }));

    await vi.waitFor(() =>
      expect(within(form).getByLabelText("블로그 제목")).toHaveAttribute("aria-invalid", "true"),
    );
    expect(within(form).getAllByText(/사용할 수 없는 단어가 있습니다/).length).toBeGreaterThan(0);
  });

  it("만들면 목록이 다시 그려지고 안내한다", async () => {
    const page = renderPage({
      "POST /api/v1/blogs": () => {
        page.setBlogs(["marco", "marco-dev", "marco-life"]);
        return ok({ handle: "marco-life" }, { status: 201 });
      },
      "GET /api/v1/auth/handle-availability": ok({ available: true }),
    });

    const form = (await screen.findByRole("heading", { name: "새 블로그 만들기" })).closest(
      "form",
    )!;
    fireEvent.change(within(form).getByLabelText("블로그 주소"), {
      target: { value: "marco-life" },
    });
    fireEvent.change(within(form).getByLabelText("블로그 제목"), { target: { value: "생활" } });
    fireEvent.click(within(form).getByRole("button", { name: "만들기" }));

    expect(await screen.findByText("블로그 3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("블로그를 만들었습니다.");
    expect(screen.getByText("블로그 한도까지 만들어서 더 만들 수 없습니다.")).toBeInTheDocument();
  });

  it("비밀번호 확인 후 삭제, LAST_BLOG_CANNOT_BE_DELETED 문구", async () => {
    const page = renderPage({
      "DELETE /api/v1/blogs/marco-dev": fail(409, "LAST_BLOG_CANNOT_BE_DELETED"),
    });

    const item = within((await screen.findAllByRole("listitem"))[1]);
    fireEvent.click(item.getByText("블로그 삭제"));
    expect(item.getByText(/삭제하면 되돌릴 수 없습니다/)).toBeInTheDocument();
    const password = item.getByLabelText("비밀번호 확인");
    expect(password).toBeRequired();
    fireEvent.change(password, { target: { value: "secret123" } });
    fireEvent.click(item.getByRole("button", { name: "삭제" }));

    expect(await item.findByText("마지막 남은 블로그는 삭제할 수 없습니다.")).toBeInTheDocument();
    expect(page.backend.callsTo("DELETE /api/v1/blogs/marco-dev")[0].body).toEqual({
      password: "secret123",
    });
  });

  it("비밀번호가 틀리면 CURRENT_PASSWORD_MISMATCH 문구", async () => {
    renderPage({
      "DELETE /api/v1/blogs/marco-dev": fail(400, "CURRENT_PASSWORD_MISMATCH"),
    });

    const item = within((await screen.findAllByRole("listitem"))[1]);
    fireEvent.change(item.getByLabelText("비밀번호 확인"), { target: { value: "wrong" } });
    fireEvent.click(item.getByRole("button", { name: "삭제" }));

    expect(await item.findByText("비밀번호가 맞지 않습니다.")).toBeInTheDocument();
  });

  it("삭제하면 목록에서 빠지고 안내한다", async () => {
    const page = renderPage({
      "DELETE /api/v1/blogs/marco-dev": () => {
        page.setBlogs(["marco"]);
        return ok(null);
      },
    });

    const item = within((await screen.findAllByRole("listitem"))[1]);
    fireEvent.change(item.getByLabelText("비밀번호 확인"), { target: { value: "secret123" } });
    fireEvent.click(item.getByRole("button", { name: "삭제" }));

    expect(await screen.findByText("블로그 1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("블로그를 삭제했습니다.");
  });
});

describe("settings/blogs meta", () => {
  it("noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("en") }] } as unknown as MetaArgs;
    expect(meta(args)).toEqual([
      { title: "My blogs - Blog" },
      { name: "robots", content: "noindex" },
    ]);
  });
});
