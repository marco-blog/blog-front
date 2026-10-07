// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PortalHome, ReleaseNoteList } from "~/api/models";
import Home, { loader, meta } from "~/routes/home";

import { fail, mockBackend, ok } from "../support/backend";
import { portalCard, topicNode } from "../support/fixtures";
import { renderRoutes, rootData, type RenderRoutesOptions } from "../support/render";
import { caught, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const PORTAL = "GET /api/v1/portal";
const TOPICS = "GET /api/v1/topics";
const RELEASE_NOTES = "GET /api/v1/release-notes";
const LATEST = "GET /api/v1/portal/latest";
const NOW = "2026-10-06T07:24:19.000Z";

const home = (overrides: Partial<PortalHome> = {}): PortalHome => ({
  curations: [portalCard(1)],
  popular: [portalCard(2)],
  latest: { items: [portalCard(3)], nextCursor: "c1" },
  popularTags: [{ name: "spring", postCount: 3 }],
  newBlogs: [
    {
      handle: "marco",
      title: "새 블로그",
      description: null,
      coverImageUrl: null,
      owner: { nickname: "마르코", profileImageUrl: null },
      firstPublishedAt: "2026-10-05T00:00:00Z",
    },
  ],
  generatedAt: "2026-10-06T07:20:00Z",
  ...overrides,
});
const topics = [topicNode(5, "knowledge", { onTab: true })];
const releaseNotes: ReleaseNoteList = {
  items: [],
  portalCard: {
    version: "1.2.0",
    title: "주제 탭이 생겼어요",
    releaseDate: "2026-10-06",
    firstPublishedAt: "2026-10-06T00:00:00Z",
    lang: "ko",
  },
};

function cursorPage(items: unknown[], nextCursor?: string) {
  return new Response(
    JSON.stringify({
      header: { isSuccessful: true, resultCode: "OK", resultMessage: "" },
      result: items,
      ...(nextCursor ? { nextCursor } : {}),
    }),
    { headers: { "content-type": "application/json" } },
  );
}

const callLoader = (path = "/") => loader(routeArgs<LoaderArgs>(getRequest(path)));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

/** 포털 메인 loader(003 T044, contracts/routes.md `/`) */
describe("home loader", () => {
  it("/portal·/topics·/release-notes를 함께 부르고 서버 시각을 넘긴다", async () => {
    const backend = mockBackend({
      [PORTAL]: ok(home()),
      [TOPICS]: ok(topics),
      [RELEASE_NOTES]: ok(releaseNotes),
    });

    const data = await callLoader();

    expect(data).toMatchObject({
      portal: home(),
      topics,
      releaseCard: releaseNotes.portalCard,
      cursor: null,
      cursorBatch: null,
      now: NOW,
      origin: "http://front.test",
    });
    expect(backend.calls.map((call) => call.path).sort()).toEqual([
      "/api/v1/portal",
      "/api/v1/release-notes",
      "/api/v1/topics",
    ]);
    expect(backend.callsTo(LATEST)).toHaveLength(0);
  });

  it("/topics·/release-notes가 실패하면 그 영역만 숨긴다", async () => {
    mockBackend({ [PORTAL]: ok(home()), [TOPICS]: fail(500, "INTERNAL_ERROR") });

    const data = await callLoader();

    expect(data.topics).toEqual([]);
    expect(data.releaseCard).toBeNull();
  });

  it("/portal이 실패하면 오류 응답", async () => {
    mockBackend({ [PORTAL]: fail(503, "INTERNAL_ERROR"), [TOPICS]: ok(topics) });
    expect(statusOf(await caught(callLoader()))).toBe(503);
  });

  it("?cursor=면 /portal/latest?cursor=도 부르고 그 묶음을 넘긴다", async () => {
    const backend = mockBackend({
      [PORTAL]: ok(home()),
      [TOPICS]: ok(topics),
      [RELEASE_NOTES]: ok(releaseNotes),
      [LATEST]: cursorPage([portalCard(9)], "c2"),
    });

    const data = await callLoader("/?cursor=c1");

    expect(backend.callsTo(LATEST)[0].url.searchParams.get("cursor")).toBe("c1");
    expect(data.cursor).toBe("c1");
    expect(data.cursorBatch).toEqual({ cursor: "c1", items: [portalCard(9)], nextCursor: "c2" });
  });

  it("마지막 묶음은 nextCursor null, 잘못된 커서는 첫 묶음으로", async () => {
    mockBackend({ [PORTAL]: ok(home()), [LATEST]: cursorPage([portalCard(9)]) });
    expect((await callLoader("/?cursor=c9")).cursorBatch?.nextCursor).toBeNull();

    mockBackend({
      [PORTAL]: ok(home()),
      [LATEST]: fail(400, "VALIDATION_FAILED", [{ field: "cursor", code: "INVALID" }]),
    });
    expect((await callLoader("/?cursor=bad")).cursorBatch).toBeNull();
  });

  it("?source=external(007)이면 /portal/latest?source=로 첫 묶음, 커서와 함께면 둘 다", async () => {
    const backend = mockBackend({
      [PORTAL]: ok(home()),
      [LATEST]: cursorPage([portalCard(9, { source: "EXTERNAL" })], "c2"),
    });

    const data = await callLoader("/?source=external");

    const call = backend.callsTo(LATEST)[0].url.searchParams;
    expect(call.get("source")).toBe("external");
    expect(call.get("cursor")).toBeNull();
    expect(data.source).toBe("external");
    expect(data.cursorBatch).toEqual({
      cursor: null,
      items: [portalCard(9, { source: "EXTERNAL" })],
      nextCursor: "c2",
    });

    const next = mockBackend({ [PORTAL]: ok(home()), [LATEST]: cursorPage([]) });
    await callLoader("/?source=internal&cursor=c2");
    expect(Object.fromEntries(next.callsTo(LATEST)[0].url.searchParams)).toEqual({
      source: "internal",
      cursor: "c2",
    });
  });

  it("모르는 ?source=는 전체(필터 호출 없음)", async () => {
    const backend = mockBackend({ [PORTAL]: ok(home()) });
    expect((await callLoader("/?source=bogus")).source).toBe("all");
    expect(backend.callsTo(LATEST)).toHaveLength(0);
  });
});

describe("home meta", () => {
  const args = (loaderData: Partial<LoaderData> | undefined) =>
    ({ loaderData, matches: [{ id: "root", loaderData: rootData("ko") }] }) as unknown as MetaArgs;

  it("서비스명·설명·og·canonical /", () => {
    const tags = meta(args({ origin: "https://blog.java21.net", cursor: null }));
    expect(tags).toContainEqual({ title: "블로그" });
    expect(tags).toContainEqual({
      name: "description",
      content: "글을 쓰고 나누는 블로그 서비스입니다. 주제별 인기 글과 최신 글을 둘러보세요.",
    });
    expect(tags).toContainEqual({ property: "og:type", content: "website" });
    expect(tags).toContainEqual({ property: "og:url", content: "https://blog.java21.net/" });
    expect(tags).toContainEqual({
      tagName: "link",
      rel: "canonical",
      href: "https://blog.java21.net/",
    });
    expect(tags).not.toContainEqual({ name: "robots", content: "noindex" });
  });

  it("출처 필터 주소는 noindex(007)", () => {
    expect(
      meta(args({ origin: "https://blog.java21.net", cursor: null, source: "external" })),
    ).toContainEqual({
      name: "robots",
      content: "noindex",
    });
  });

  it("커서 묶음 주소는 noindex", () => {
    expect(meta(args({ origin: "https://blog.java21.net", cursor: "c1" }))).toContainEqual({
      name: "robots",
      content: "noindex",
    });
    expect(meta(args(undefined))).toContainEqual({ title: "블로그" });
  });
});

describe("home 화면", () => {
  const loaded = (overrides: Partial<LoaderData> = {}): LoaderData => ({
    portal: home(),
    topics,
    releaseCard: releaseNotes.portalCard,
    cursor: null,
    source: "all",
    cursorBatch: null,
    now: NOW,
    origin: "http://front.test",
    ...overrides,
  });

  function renderHome(data: LoaderData, user: RenderRoutesOptions["user"] = null) {
    return renderRoutes([{ index: true, loader: () => data, Component: Home }], { user });
  }

  it("영역 순서: 릴리스 노트 카드 → 추천 → 탭 → 인기 → 최신 → 태그 → 새 블로그", async () => {
    renderHome(loaded());

    const main = await screen.findByRole("main");
    const order = [
      main.querySelector(".portal-release-note"),
      screen.getByRole("region", { name: "운영자 추천" }),
      screen.getByRole("navigation", { name: "주제" }),
      screen.getByRole("region", { name: "인기 글" }),
      screen.getByRole("region", { name: "최신 글" }),
      screen.getByRole("region", { name: "인기 태그" }),
      screen.getByRole("region", { name: "새로 시작한 블로그" }),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(within(main).getByRole("link", { name: "업데이트 보기" })).toHaveAttribute(
      "href",
      "/updates/v1.2.0",
    );
    expect(main).toHaveTextContent("새 소식: 주제 탭이 생겼어요");
    expect(screen.queryByRole("link", { name: "구독 피드 보기" })).toBeNull();
  });

  it("로그인 회원에게 구독 피드 보기", async () => {
    renderHome(loaded({ releaseCard: null }), { userId: 1, nickname: "마르코", role: "USER" });

    expect(await screen.findByRole("link", { name: "구독 피드 보기" })).toHaveAttribute(
      "href",
      "/feed",
    );
    expect(document.querySelector(".portal-release-note")).toBeNull();
  });

  it("커서 묶음이 있으면 최신 글 영역에 그 묶음", async () => {
    renderHome(
      loaded({
        cursor: "c1",
        cursorBatch: { cursor: "c1", items: [portalCard(9)], nextCursor: null },
      }),
    );
    const latest = await screen.findByRole("region", { name: "최신 글" });
    expect(within(latest).getByText("포털 글 9")).toBeInTheDocument();
    expect(within(latest).queryByText("포털 글 3")).toBeNull();
  });

  it("모두 비면 첫 글 안내(비로그인 /signup, 로그인 /write)", async () => {
    const empty = home({
      curations: [],
      popular: [],
      latest: { items: [], nextCursor: null },
      popularTags: [],
      newBlogs: [],
    });
    renderHome(loaded({ portal: empty, topics: [] }));
    expect(await screen.findByRole("link", { name: "가입하고 첫 글을 써 보세요" })).toHaveAttribute(
      "href",
      "/signup",
    );
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("같은 id의 내부·외부 카드가 함께 그려지고(키 source-id), 최신 위에 출처 필터", async () => {
    const external = portalCard(3, {
      source: "EXTERNAL",
      title: "외부 글 3",
      blog: { handle: null, title: "Dev Log" },
      author: null,
      externalBlog: { id: 1, title: "Dev Log", siteHost: "dev.example.com" },
      visitUrl: "/api/v1/external-posts/3/visit",
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    renderHome(
      loaded({ portal: home({ latest: { items: [portalCard(3), external], nextCursor: "c1" } }) }),
    );

    const latest = await screen.findByRole("region", { name: "최신 글" });
    expect(within(latest).getByText("포털 글 3")).toBeInTheDocument();
    expect(within(latest).getByText("외부 글 3")).toBeInTheDocument();
    expect(errors.mock.calls.flat().join(" ")).not.toContain("same key");
    errors.mockRestore();
    const filter = within(latest).getByRole("navigation", { name: "출처" });
    expect(within(filter).getByRole("link", { name: "전체" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(latest).getByRole("link", { name: "더 보기" })).toHaveAttribute(
      "href",
      "/?cursor=c1",
    );
  });

  it("출처 필터 결과가 비면 필터와 빈 안내, 더 보기는 그 출처로", async () => {
    renderHome(
      loaded({
        source: "external",
        cursorBatch: { cursor: null, items: [], nextCursor: null },
      }),
    );
    const latest = await screen.findByRole("region", { name: "최신 글" });
    expect(latest).toHaveTextContent("이 출처의 최신 글이 없습니다.");
    expect(within(latest).getByRole("link", { name: "외부 글만" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("출처 필터 묶음의 더 보기 주소에 출처가 붙는다", async () => {
    renderHome(
      loaded({
        source: "internal",
        cursorBatch: { cursor: null, items: [portalCard(8)], nextCursor: "n1" },
      }),
    );
    const latest = await screen.findByRole("region", { name: "최신 글" });
    expect(within(latest).getByRole("link", { name: "더 보기" })).toHaveAttribute(
      "href",
      "/?source=internal&cursor=n1",
    );
  });
});
