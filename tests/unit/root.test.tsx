// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import {
  MemoryRouter,
  Outlet,
  createRoutesStub,
  createStaticHandler,
  data,
  type StaticHandlerContext,
} from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "~/api/errors";
import { getSessionUser, type SessionUser } from "~/auth/session.server";
import { ErrorPage } from "~/components/ErrorPage";
import { Footer } from "~/components/layout/Footer";
import { Header } from "~/components/layout/Header";
import type { Language } from "~/i18n/config";
import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import App, { ErrorBoundary, Layout, loader as rootLoader, type RootData } from "~/root";
import Home from "~/routes/home";
import NotFoundRoute, { loader as notFoundLoader } from "~/routes/not-found";

vi.mock("~/auth/session.server", () => ({ getSessionUser: vi.fn() }));

const getSessionUserMock = vi.mocked(getSessionUser);

const member: SessionUser = {
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ja",
  timeZone: "Asia/Seoul",
  blogs: [{ handle: "marco", title: "마르코의 블로그" }],
  unseenReleaseNote: null,
};

const headerUser = { userId: 7, nickname: "마르코", role: "USER" };

beforeEach(() => {
  getSessionUserMock.mockReset();
  getSessionUserMock.mockResolvedValue(null);
});

function withI18n(ui: React.ReactNode, language: Language = "ko") {
  return (
    <I18nextProvider i18n={createI18n(language, resourcesFor(language))}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>
  );
}

const rootData = (language: Language, user: RootData["user"] = null): RootData => ({
  language,
  resources: resourcesFor(language),
  user,
});

type LoaderArgs = Parameters<typeof rootLoader>[0];
const callRootLoader = (headers: Record<string, string>) =>
  rootLoader({ request: new Request("http://front.test/", { headers }) } as LoaderArgs);

describe("root loader", () => {
  it("비로그인: 쿠키·Accept-Language로 언어를 정하고 그 언어와 대체 언어 리소스를 넘긴다", async () => {
    const result = await callRootLoader({ "accept-language": "ja" });

    expect(result.language).toBe("ja");
    expect(result.user).toBeNull();
    expect(Object.keys(result.resources).sort()).toEqual(["en", "ja", "ko"]);
  });

  it("로그인: 회원 언어 설정이 쿠키보다 먼저이고, 상단에 쓸 정보만 넘긴다", async () => {
    getSessionUserMock.mockResolvedValue(member);

    const result = await callRootLoader({ cookie: "access_token=a; lang=en" });

    expect(result.language).toBe("ja");
    expect(result.user).toEqual(headerUser);
  });

  it("backend에 닿지 못해도 비로그인 화면으로 그린다", async () => {
    getSessionUserMock.mockRejectedValue(
      new ApiError({ status: 502, resultCode: "BACKEND_UNAVAILABLE" }),
    );

    const result = await callRootLoader({ cookie: "access_token=a", "accept-language": "ko" });

    expect(result).toMatchObject({ language: "ko", user: null });
  });

  it("ApiError가 아닌 오류는 그대로 던진다", async () => {
    getSessionUserMock.mockRejectedValue(new Error("bug"));

    await expect(callRootLoader({})).rejects.toThrow("bug");
  });
});

describe("Header", () => {
  it("비로그인: 로그인·회원가입", () => {
    render(withI18n(<Header user={null} />));

    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
    expect(within(nav).getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
    expect(within(nav).queryByRole("link", { name: "글쓰기" })).toBeNull();
    expect(within(nav).queryByRole("button", { name: "로그아웃" })).toBeNull();
    expect(screen.getByRole("link", { name: "블로그" })).toHaveAttribute("href", "/");
  });

  it("로그인: 글쓰기·내 블로그 관리·설정·로그아웃(POST /logout)", () => {
    render(withI18n(<Header user={headerUser} />, "en"));

    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(within(nav).getByRole("link", { name: "Write" })).toHaveAttribute("href", "/write");
    expect(within(nav).getByRole("link", { name: "Manage my blog" })).toHaveAttribute(
      "href",
      "/manage",
    );
    expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
    const logout = within(nav).getByRole("button", { name: "Log out" });
    const form = logout.closest("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/logout");
    expect(within(nav).queryByRole("link", { name: "Log in" })).toBeNull();
  });
});

describe("Footer", () => {
  it("약관·개인정보처리방침 링크와 언어 선택 자리", () => {
    render(withI18n(<Footer />, "zh-CN"));

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "服务条款" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(within(footer).getByRole("link", { name: "隐私政策" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    const languageSlot = within(footer).getByRole("group", { name: "语言" });
    expect(languageSlot).toHaveTextContent("简体中文");
  });
});

/** 프레임워크 모드처럼 Layout이 화면과 오류 경계를 감싸는 라우트 */
function stub(children: Parameters<typeof createRoutesStub>[0], data: RootData | null) {
  return createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: data ? () => data : undefined,
      Component: () => (
        <Layout>
          <App />
        </Layout>
      ),
      ErrorBoundary: ({ error }: { error: unknown }) => (
        <Layout>
          <ErrorBoundary {...({ error } as Parameters<typeof ErrorBoundary>[0])} />
        </Layout>
      ),
      HydrateFallback: () => null,
      children,
    },
  ]);
}

describe("Layout", () => {
  it("root loader의 언어로 html lang, 상단·본문·하단을 그린다", async () => {
    const Stub = stub([{ index: true, Component: Home }], rootData("ja", headerUser));

    render(<Stub />);

    expect(await screen.findByText("ブログサービスを準備しています。")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ja");
    expect(screen.getByRole("banner")).toHaveTextContent("ログアウト");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("利用規約");
  });

  it("root 데이터가 없으면 기본 언어(en)·비로그인으로 그린다", async () => {
    const Stub = createRoutesStub([
      {
        id: "other",
        path: "/",
        Component: () => (
          <Layout>
            <p>child</p>
          </Layout>
        ),
      },
    ]);

    render(<Stub />);

    expect(await screen.findByText("child")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByRole("banner")).toHaveTextContent("Log in");
  });

  it("하위 loader가 404를 던지면 상단·하단과 함께 찾을 수 없음 화면", async () => {
    const Stub = stub(
      [
        {
          path: "gone",
          loader: () => {
            throw data(null, { status: 404 });
          },
          Component: () => <p>never</p>,
        },
      ],
      rootData("ko"),
    );

    render(<Stub initialEntries={["/gone"]} />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "페이지를 찾을 수 없습니다",
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.queryByText("never")).toBeNull();
  });
});

describe("HTTP 404 상태", () => {
  const handler = createStaticHandler([
    {
      id: "root",
      path: "/",
      loader: rootLoader as never,
      Component: Outlet,
      ErrorBoundary: () => null,
      children: [
        { index: true, Component: Home },
        {
          path: "posts/:id",
          loader: () => {
            throw data({ resultCode: "POST_NOT_FOUND" }, { status: 404 });
          },
        },
        { path: "*", loader: notFoundLoader, Component: NotFoundRoute },
      ],
    },
  ]);

  const query = async (path: string) =>
    (await handler.query(new Request(`http://front.test${path}`))) as StaticHandlerContext;

  it("없는 경로는 404", async () => {
    expect((await query("/no/such/page")).statusCode).toBe(404);
  });

  it("loader가 404를 던지면 오류 경계로 가고 404", async () => {
    const context = await query("/posts/9");
    expect(context.statusCode).toBe(404);
    expect(context.errors).not.toBeNull();
  });

  it("있는 경로는 200", async () => {
    expect((await query("/")).statusCode).toBe(200);
  });
});

describe("ErrorBoundary", () => {
  type Props = Parameters<typeof ErrorBoundary>[0];
  const renderBoundary = (error: unknown) =>
    render(withI18n(<ErrorBoundary {...({ error } as Props)} />, "ko"));

  it("404 응답은 404 화면", () => {
    renderBoundary({ status: 404, statusText: "Not Found", internal: false, data: null });
    expect(screen.getByRole("heading")).toHaveTextContent("페이지를 찾을 수 없습니다");
  });

  it("API 오류 코드가 있으면 그 문구", () => {
    renderBoundary({
      status: 403,
      statusText: "",
      internal: false,
      data: { resultCode: "FORBIDDEN" },
    });
    expect(screen.getByText("이 작업을 할 권한이 없습니다.")).toBeInTheDocument();
  });

  it("코드가 없으면 일반 안내", () => {
    renderBoundary({ status: 500, statusText: "", internal: false, data: null });
    expect(screen.getByText("잠시 후 다시 시도해 주세요.")).toBeInTheDocument();
  });

  it("예상하지 못한 오류는 개발 환경에서 스택을 보여준다", () => {
    renderBoundary(new Error("boom"));
    expect(screen.getByRole("heading")).toHaveTextContent("문제가 생겼습니다");
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});

describe("ErrorPage", () => {
  it("넘긴 문구를 보여준다", () => {
    render(withI18n(<ErrorPage message="m" />));
    expect(screen.getByText("m")).toBeInTheDocument();
  });
});
