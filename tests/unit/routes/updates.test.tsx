// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ReleaseNoteDetail, ReleaseNoteSummary } from "~/api/models";
import History, { loader as historyLoader, meta as historyMeta } from "~/routes/updates/history";
import Index, { loader as indexLoader, meta as indexMeta } from "~/routes/updates/index";
import Layout, { loader as layoutLoader } from "~/routes/updates/layout";
import Revision, {
  loader as revisionLoader,
  meta as revisionMeta,
} from "~/routes/updates/revision";
import Version, { loader as versionLoader, meta as versionMeta } from "~/routes/updates/version";
import routes from "~/routes";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

const ME = "GET /api/v1/me";
const LIST = "GET /api/v1/release-notes";
const loggedIn = { cookie: "access_token=a" };
const member = {
  userId: 7,
  email: "m@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ja",
  timeZone: "Asia/Seoul",
  blogs: [],
  unseenReleaseNote: { version: "1.3.0", title: "t" },
  unreadNotificationCount: 0,
};

const summary = (version: string, title = `v${version} 소식`): ReleaseNoteSummary => ({
  version,
  title,
  releaseDate: "2026-10-06",
  firstPublishedAt: "2026-10-06T00:00:00Z",
  lang: "ko",
});
const items = [summary("1.2.0"), summary("1.3.0"), summary("1.2.1")];

const detail = (overrides: Partial<ReleaseNoteDetail> = {}): ReleaseNoteDetail => ({
  version: "1.3.0",
  releaseDate: "2026-10-06",
  firstPublishedAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-06T01:00:00Z",
  requestedLang: "ko",
  lang: "ko",
  title: "1.3.0 새 기능",
  contentHtml: '<h2 id="새-기능">새 기능</h2><p>포털이 생겼습니다.</p><h3 id="주제">주제</h3>',
  toc: [
    { level: 2, text: "새 기능", anchor: "새-기능" },
    { level: 3, text: "주제", anchor: "주제" },
  ],
  prev: { version: "1.2.1", title: "1.2.1 고침" },
  next: null,
  revisionCount: 1,
  revisionNo: 1,
  ...overrides,
});

const call = <R,>(fn: (args: never) => R, path: string, params = {}, headers = {}) =>
  fn(routeArgs<never>(getRequest(path, headers), params));
const metaArgs = (loaderData: unknown) =>
  ({ matches: [{ id: "root", loaderData: rootData("ko") }], loaderData }) as never;

function renderUpdates(path: string, backend: Record<string, BackendHandler | Response>) {
  const mock = mockBackend({ [LIST]: ok({ items, portalCard: null }), ...backend });
  renderRoutes(
    [
      {
        path: "updates",
        loader: layoutLoader as never,
        Component: Layout,
        children: [
          { index: true, loader: indexLoader as never, Component: Index },
          { path: ":version", loader: versionLoader as never, Component: Version },
          { path: ":version/history", loader: historyLoader as never, Component: History },
          {
            path: ":version/history/:revisionNo",
            loader: revisionLoader as never,
            Component: Revision,
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  return mock;
}

/** 릴리스 노트 위키(003 T114) */
describe("/updates loader", () => {
  it("레이아웃은 화면 언어로 버전 목록을 읽는다", async () => {
    const backend = mockBackend({ [LIST]: ok({ items, portalCard: null }) });

    await expect(call(layoutLoader, "/updates", {}, { "accept-language": "ja" })).resolves.toEqual({
      items,
    });
    expect(backend.callsTo(LIST)[0].url.searchParams.get("lang")).toBe("ja");
  });

  it("/updates: 가장 새 버전의 본문을 읽는다, 노트가 없으면 empty", async () => {
    const backend = mockBackend({
      [LIST]: ok({ items, portalCard: null }),
      "GET /api/v1/release-notes/1.3.0": ok(detail()),
    });

    await expect(call(indexLoader, "/updates")).resolves.toMatchObject({
      mode: "latest",
      note: { version: "1.3.0" },
    });
    expect(backend.callsTo("GET /api/v1/release-notes/1.3.0")).toHaveLength(1);

    mockBackend({ [LIST]: ok({ items: [], portalCard: null }) });
    await expect(call(indexLoader, "/updates")).resolves.toMatchObject({ mode: "empty" });
  });

  it("?q=: 검색(0부터 페이지), 2자 미만이면 backend를 부르지 않고, backend 400은 안내", async () => {
    const hits = [
      {
        version: "1.3.0",
        title: "새 기능",
        snippet: "…포털…",
        releaseDate: "2026-10-06",
        lang: "ko",
      },
    ];
    const backend = mockBackend({
      "GET /api/v1/release-notes/search": ok(hits, { totalCount: 1 }),
    });

    await expect(call(indexLoader, "/updates?q=%ED%8F%AC%ED%84%B8&page=2")).resolves.toMatchObject({
      mode: "search",
      q: "포털",
      page: 2,
      hits,
      totalCount: 1,
      errorCode: null,
    });
    expect(
      Object.fromEntries(backend.callsTo("GET /api/v1/release-notes/search")[0].url.searchParams),
    ).toMatchObject({ q: "포털", page: "1", size: "20" });

    await expect(call(indexLoader, "/updates?q=a")).resolves.toMatchObject({
      errorCode: "VALIDATION_FAILED",
      hits: [],
    });
    expect(backend.callsTo("GET /api/v1/release-notes/search")).toHaveLength(1);

    mockBackend({ "GET /api/v1/release-notes/search": fail(400, "VALIDATION_FAILED") });
    await expect(call(indexLoader, "/updates?q=ab")).resolves.toMatchObject({
      errorCode: "VALIDATION_FAILED",
    });
    mockBackend({ "GET /api/v1/release-notes/search": fail(500, "INTERNAL_ERROR") });
    expect(statusOf(await caught(call(indexLoader, "/updates?q=ab")))).toBe(500);
  });

  it("/updates/:version: 형식 오류·없는 버전(초안 포함)은 404", async () => {
    mockBackend({ "GET /api/v1/release-notes/9.9.9": fail(404, "RELEASE_NOTE_NOT_FOUND") });

    for (const version of ["1.2.3", "v1.2", "vx"]) {
      expect(statusOf(await caught(call(versionLoader, `/updates/${version}`, { version })))).toBe(
        404,
      );
    }
    expect(
      statusOf(await caught(call(versionLoader, "/updates/v9.9.9", { version: "v9.9.9" }))),
    ).toBe(404);
  });

  it("/updates/:version: 로그인이면 마지막 확인 버전을 갱신(실패해도 화면), 비로그인은 부르지 않는다", async () => {
    const backend = mockBackend({
      [ME]: ok(member),
      "GET /api/v1/release-notes/1.3.0": ok(detail({ requestedLang: "ja", lang: "en" })),
      "POST /api/v1/me/release-notes/seen": fail(500, "INTERNAL_ERROR"),
    });

    await expect(
      call(versionLoader, "/updates/v1.3.0", { version: "v1.3.0" }, loggedIn),
    ).resolves.toMatchObject({ note: { lang: "en" }, origin: "http://front.test" });
    expect(backend.callsTo("GET /api/v1/release-notes/1.3.0")[0].url.searchParams.get("lang")).toBe(
      "ja",
    );
    expect(backend.callsTo("POST /api/v1/me/release-notes/seen")[0].body).toEqual({
      version: "1.3.0",
    });

    const anonymous = mockBackend({ "GET /api/v1/release-notes/1.3.0": ok(detail()) });
    await call(versionLoader, "/updates/v1.3.0", { version: "v1.3.0" });
    expect(anonymous.callsTo("POST /api/v1/me/release-notes/seen")).toHaveLength(0);
  });

  it("이력·수정본: 형식 오류는 404, 수정본은 그 번호로 읽는다", async () => {
    const backend = mockBackend({
      "GET /api/v1/release-notes/1.3.0": ok(detail()),
      "GET /api/v1/release-notes/1.3.0/revisions": ok([
        { revisionNo: 2, editedAt: "2026-10-07T00:00:00Z" },
        { revisionNo: 1, editedAt: "2026-10-06T00:00:00Z" },
      ]),
      "GET /api/v1/release-notes/1.3.0/revisions/1": ok(detail({ revisionNo: 1 })),
    });

    await expect(
      call(historyLoader, "/updates/v1.3.0/history", { version: "v1.3.0" }),
    ).resolves.toMatchObject({ version: "1.3.0", title: "1.3.0 새 기능" });
    await expect(
      call(revisionLoader, "/updates/v1.3.0/history/1", { version: "v1.3.0", revisionNo: "1" }),
    ).resolves.toMatchObject({ revisionNo: 1 });
    expect(backend.callsTo("GET /api/v1/release-notes/1.3.0/revisions/1")).toHaveLength(1);
    expect(
      statusOf(await caught(call(historyLoader, "/updates/1.3/history", { version: "1.3" }))),
    ).toBe(404);
    expect(
      statusOf(
        await caught(
          call(revisionLoader, "/updates/v1.3.0/history/0", { version: "v1.3.0", revisionNo: "0" }),
        ),
      ),
    ).toBe(404);
  });
});

describe("/updates meta", () => {
  it("버전 페이지: 제목·본문 앞 150자 description·og·canonical 자기 주소", () => {
    const tags = versionMeta(metaArgs({ note: detail(), origin: "https://blog.test" })) as {
      [key: string]: string;
    }[];
    expect(tags).toContainEqual({ title: "1.3.0 새 기능 - 블로그" });
    expect(tags).toContainEqual({
      name: "description",
      content: "새 기능 포털이 생겼습니다. 주제",
    });
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.test/updates/v1.3.0",
    });
    expect(tags).toContainEqual({ property: "og:title", content: "1.3.0 새 기능 - 블로그" });
    expect(tags).not.toContainEqual({ name: "robots", content: "noindex" });
  });

  it("/updates는 최신 버전 주소가 canonical, 검색은 noindex, 노트가 없으면 /updates", () => {
    expect(
      indexMeta(metaArgs({ mode: "latest", note: detail(), origin: "https://blog.test" })),
    ).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.test/updates/v1.3.0",
    });
    expect(indexMeta(metaArgs({ mode: "search", q: "x" }))).toContainEqual({
      name: "robots",
      content: "noindex",
    });
    expect(indexMeta(metaArgs({ mode: "empty", origin: "https://blog.test" }))).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.test/updates",
    });
  });

  it("이력·수정본은 noindex, 없으면 찾을 수 없음", () => {
    expect(historyMeta(metaArgs({ version: "1.3.0" }))).toEqual([
      { title: "v1.3.0 수정 이력 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
    expect(revisionMeta(metaArgs({ note: detail(), revisionNo: 1 }))).toContainEqual({
      name: "robots",
      content: "noindex",
    });
    expect(versionMeta(metaArgs(undefined))).toContainEqual({ name: "robots", content: "noindex" });
    expect(historyMeta(metaArgs(undefined))[0]).toEqual({
      title: expect.stringContaining("블로그"),
    });
    expect(revisionMeta(metaArgs(undefined))[0]).toEqual({
      title: expect.stringContaining("블로그"),
    });
  });
});

describe("/updates 화면", () => {
  it("레이아웃(트리·검색창)과 최신 버전 본문·목차, 이전 버전 링크, 제목 id는 그대로", async () => {
    renderUpdates("/updates", { "GET /api/v1/release-notes/1.3.0": ok(detail()) });

    const tree = await screen.findByRole("navigation", { name: "버전 목록" });
    expect(
      within(tree)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["v1.3.0 v1.3.0 소식", "v1.2.1 v1.2.1 소식", "v1.2.0 v1.2.0 소식"]);
    expect(within(tree).getByRole("link", { name: /v1.3.0/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("search")).toHaveAttribute("action", "/updates");

    const article = await screen.findByRole("article");
    expect(within(article).getByRole("heading", { level: 1 })).toHaveTextContent("1.3.0 새 기능");
    expect(article.querySelector("h2#새-기능")).not.toBeNull();
    const toc = within(article).getByRole("navigation", { name: "목차" });
    expect(within(toc).getByRole("link", { name: "주제" })).toHaveAttribute("href", "#주제");
    expect(within(article).getByRole("link", { name: /이전 버전: v1.2.1/ })).toHaveAttribute(
      "href",
      "/updates/v1.2.1",
    );
    expect(within(article).queryByRole("link", { name: "수정 이력" })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(article).toHaveTextContent("2026년 10월 6일 릴리스");
  });

  it("노트가 없으면 안내", async () => {
    renderUpdates("/updates", { [LIST]: ok({ items: [], portalCard: null }) });

    expect(await screen.findByText("아직 업데이트 소식이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "버전 목록" })).toBeNull();
  });

  it("버전 페이지: 대체 언어판 안내, 수정본이 2개 이상이면 수정 이력 링크, 다음 버전", async () => {
    renderUpdates("/updates/v1.2.1", {
      "GET /api/v1/release-notes/1.2.1": ok(
        detail({
          version: "1.2.1",
          requestedLang: "ja",
          lang: "en",
          revisionCount: 2,
          prev: null,
          next: { version: "1.3.0", title: "1.3.0 새 기능" },
        }),
      ),
    });

    const article = await screen.findByRole("article");
    expect(within(article).getByRole("note")).toHaveTextContent(
      "일본어판이 없어 영어판으로 보여 드립니다.",
    );
    expect(within(article).getByRole("link", { name: "수정 이력" })).toHaveAttribute(
      "href",
      "/updates/v1.2.1/history",
    );
    expect(within(article).getByRole("link", { name: /다음 버전: v1.3.0/ })).toHaveAttribute(
      "href",
      "/updates/v1.3.0",
    );
    expect(
      within(screen.getByRole("navigation", { name: "버전 목록" })).getByRole("link", {
        name: /v1.2.1/,
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("검색 결과: 버전·제목·일치 부분, 결과 없음, 2자 미만이면 입력란 문구", async () => {
    renderUpdates("/updates?q=%ED%8F%AC%ED%84%B8", {
      "GET /api/v1/release-notes/search": ok(
        [
          {
            version: "1.3.0",
            title: "새 기능",
            snippet: "…포털이 생겼…",
            releaseDate: "2026-10-06",
            lang: "ko",
          },
        ],
        { totalCount: 1 },
      ),
    });

    const results = await screen.findByRole("region", { name: "「포털」 검색 결과" });
    expect(within(results).getByRole("link", { name: "v1.3.0 새 기능" })).toHaveAttribute(
      "href",
      "/updates/v1.3.0",
    );
    expect(results).toHaveTextContent("…포털이 생겼…");
    expect(results).toHaveTextContent("1건");
    expect(screen.getByRole("searchbox", { name: "업데이트 소식 검색" })).toHaveValue("포털");
  });

  it("검색어가 짧으면 입력란 아래 문구와 안내", async () => {
    renderUpdates("/updates?q=a", {});

    expect(await screen.findByText("2자 이상 입력해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("입력한 내용을 확인해 주세요.");
    expect(
      within(screen.getByRole("navigation", { name: "버전 목록" })).queryByRole("link", {
        current: "page",
      }),
    ).toBeNull();
  });

  it("검색 결과가 없으면 안내", async () => {
    renderUpdates("/updates?q=없는말", {
      "GET /api/v1/release-notes/search": ok([], { totalCount: 0 }),
    });

    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
  });

  it("수정 이력 목록(관리자 이름 없음)과 이전 수정본 표시", async () => {
    renderUpdates("/updates/v1.3.0/history", {
      "GET /api/v1/release-notes/1.3.0": ok(detail({ revisionCount: 2 })),
      "GET /api/v1/release-notes/1.3.0/revisions": ok([
        { revisionNo: 2, editedAt: "2026-10-07T00:00:00Z" },
        { revisionNo: 1, editedAt: "2026-10-06T00:00:00Z" },
      ]),
      "GET /api/v1/release-notes/1.3.0/revisions/1": ok(
        detail({ revisionNo: 1, contentHtml: "<p>처음 내용</p>", toc: [] }),
      ),
    });

    expect(await screen.findByRole("heading", { name: "v1.3.0 수정 이력" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "수정본 목록" });
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/updates/v1.3.0/history/2", "/updates/v1.3.0/history/1"]);
    within(list).getByRole("link", { name: "수정본 1" }).click();

    const article = await screen.findByRole("article");
    expect(within(article).getByRole("note")).toHaveTextContent(
      "이전 수정본(수정본 1)입니다. 지금 내용과 다를 수 있습니다.",
    );
    expect(article).toHaveTextContent("처음 내용");
    expect(within(article).getByRole("link", { name: "현재 버전 보기" })).toHaveAttribute(
      "href",
      "/updates/v1.3.0",
    );
  });

  it("라우트: /updates 아래 5개가 /:handle 계열보다 앞에", () => {
    const paths = routes.map((route) => route.path);
    expect(paths.indexOf("updates")).toBeLessThan(paths.indexOf(":handle"));
    expect(
      routes.find((route) => route.path === "updates")?.children?.map((c) => c.path ?? "(index)"),
    ).toEqual(["(index)", "seen", ":version", ":version/history", ":version/history/:revisionNo"]);
  });
});
