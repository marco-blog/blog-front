// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedPreview } from "~/api/models";
import { ADMIN_EXTERNAL_TABS } from "~/components/external/AdminExternalTabs";
import AdminExternalBlog, {
  action as detailAction,
  loader as detailLoader,
  postsHref,
} from "~/routes/admin/external-blog";
import AdminExternalBlogNew, {
  action as newAction,
  loader as newLoader,
} from "~/routes/admin/external-blog-new";
import AdminExternalBlogs, {
  externalBlogsHref,
  loader as listLoader,
  meta,
} from "~/routes/admin/external-blogs";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, failWithParams, mockBackend, ok } from "../support/backend";
import { adminExternalBlog, externalTopics, myExternalPost } from "../support/fixtures";
import { renderRoutes } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
} from "../support/route";

/** 007 T031: 콘솔 "외부 블로그 관리" 목록·직접 등록·상세 */
const LIST = "GET /api/v1/admin/external-blogs";
const CREATE = "POST /api/v1/admin/external-blogs";
const PREVIEW = "POST /api/v1/external-blog-previews";
const TOPICS = "GET /api/v1/topics";
const DETAIL_3 = "GET /api/v1/admin/external-blogs/3";
const POSTS_3 = "GET /api/v1/admin/external-blogs/3/posts";
const APPROVE_3 = "POST /api/v1/admin/external-blogs/3/approve";
const REJECT_3 = "POST /api/v1/admin/external-blogs/3/reject";
const PATCH_3 = "PATCH /api/v1/admin/external-blogs/3";
const PAUSE_3 = "POST /api/v1/admin/external-blogs/3/pause";
const RESUME_3 = "POST /api/v1/admin/external-blogs/3/resume";
const BLOCK_3 = "POST /api/v1/admin/external-blogs/3/block";
const REMOVE_31 = "POST /api/v1/admin/external-posts/31/remove";
const EXCLUSION_31 = "/api/v1/admin/portal/external-exclusions/31";
const FEED = "https://remote.example/feed.xml";

type ListArgs = Parameters<typeof listLoader>[0];
type NewArgs = Parameters<typeof newAction>[0];
type DetailArgs = Parameters<typeof detailLoader>[0];
type DetailActionArgs = Parameters<typeof detailAction>[0];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("목록", () => {
  it("loader: 상태·검색어(2자 이상)·쪽 번호, 승인 대기 수는 size=1의 totalCount", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [LIST]: (request) =>
        request.url.searchParams.get("size") === "1"
          ? ok([adminExternalBlog(9, { status: "PENDING" })], { totalCount: 4 })
          : ok([adminExternalBlog(3)], { totalCount: 21 }),
    });
    const data = await listLoader(
      routeArgs<ListArgs>(
        getRequest("/admin/external-blogs?status=ACTIVE&q=remote&page=2", loggedIn),
      ),
    );
    expect(data).toMatchObject({ status: "ACTIVE", q: "remote", page: 2, totalCount: 21 });
    expect(data.pendingCount).toBe(4);
    const query = backend.callsTo(LIST)[0].url.searchParams;
    expect(query.get("status")).toBe("ACTIVE");
    expect(query.get("q")).toBe("remote");
    expect(query.get("page")).toBe("1");

    const short = await listLoader(
      routeArgs<ListArgs>(getRequest("/admin/external-blogs?status=NOPE&q=r", loggedIn)),
    );
    expect(short).toMatchObject({ status: null, q: "", tooShort: true });

    mockBackend({ [ME]: ok(member("USER")) });
    expect(
      statusOf(
        await caught(
          listLoader(routeArgs<ListArgs>(getRequest("/admin/external-blogs", loggedIn))),
        ),
      ),
    ).toBe(404);
  });

  it("주소 도우미와 meta", () => {
    expect(externalBlogsHref(null, "")).toBe("/admin/external-blogs");
    expect(externalBlogsHref("PENDING", "dev", 3)).toBe(
      "/admin/external-blogs?status=PENDING&q=dev&page=3",
    );
    expect(postsHref(3, "REMOVED", 2)).toBe("/admin/external-blogs/3?status=REMOVED&page=2");
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
    expect(ADMIN_EXTERNAL_TABS.filter((tab) => tab.available).map((tab) => tab.key)).toEqual([
      "blogs",
      "reviews",
      "stats",
      "rules",
      "settings",
    ]);
  });

  it("상태 탭(승인 대기 먼저·수), 표, 직접 등록 링크", async () => {
    mockBackend({
      [ME]: ok(member()),
      [LIST]: ok(
        [
          adminExternalBlog(3, {
            status: "PENDING",
            ownershipVerified: true,
            pendingReviewCount: 2,
          }),
          adminExternalBlog(4, { member: null, registrationType: "ADMIN_DIRECT" }),
        ],
        { totalCount: 2 },
      ),
    });
    renderRoutes(
      [{ path: "admin/external-blogs", loader: stub(listLoader), Component: AdminExternalBlogs }],
      { initialEntries: ["/admin/external-blogs"] },
    );
    const tabs = await screen.findByRole("navigation", { name: "상태" });
    const links = within(tabs).getAllByRole("link");
    expect(links[0]).toHaveTextContent("승인 대기 (2)");
    expect(links.at(-1)).toHaveTextContent("전체");
    expect(links.at(-1)).toHaveAttribute("aria-current", "page");
    const table = screen.getByRole("table", { name: "외부 블로그 관리" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("회원 신청");
    expect(rows[0]).toHaveTextContent("소유 인증됨");
    expect(rows[1]).toHaveTextContent("운영자 직접 등록");
    expect(screen.getByRole("link", { name: "직접 등록" })).toHaveAttribute(
      "href",
      "/admin/external-blogs/new",
    );
  });
});

describe("직접 등록", () => {
  const call = (fields: Record<string, string>) =>
    newAction(routeArgs<NewArgs>(formRequest("/admin/external-blogs/new", fields, loggedIn)));

  it("등록 근거는 필수, 등록하면 상세로", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [CREATE]: ok(adminExternalBlog(3), { status: 201 }),
    });
    const missing = asData<{ error: { fieldErrors: unknown[] } }>(
      await call({ intent: "create", url: FEED, defaultTopicId: "11", registrationBasis: " " }),
    );
    expect(missing.init?.status).toBe(400);
    expect(missing.data.error.fieldErrors).toEqual([
      { field: "registrationBasis", code: "REQUIRED" },
    ]);
    expect(backend.callsTo(CREATE)).toHaveLength(0);

    expect(
      expectRedirect(
        await caught(
          call({
            intent: "create",
            url: FEED,
            defaultTopicId: "11",
            registrationBasis: "public feed",
          }),
        ),
      ),
    ).toBe("/admin/external-blogs/3");
    expect(backend.callsTo(CREATE)[0].body).toEqual({
      feedUrl: FEED,
      defaultTopicId: 11,
      registrationBasis: "public feed",
    });
    expect(asData(await call({ intent: "nope" })).init?.status).toBe(400);
  });

  it("미리보기는 찾은 피드 주소로 입력란을 바꾸고, 권한 회수는 404", async () => {
    const preview: FeedPreview = {
      feedUrl: FEED,
      siteUrl: null,
      title: "Remote",
      format: "ATOM",
      recentPosts: [],
      registered: null,
    };
    mockBackend({ [ME]: ok(member()), [TOPICS]: ok(externalTopics()), [PREVIEW]: ok(preview) });
    renderRoutes(
      [
        {
          path: "admin/external-blogs/new",
          loader: stub(newLoader),
          action: stub(newAction),
          Component: AdminExternalBlogNew,
        },
      ],
      { initialEntries: ["/admin/external-blogs/new"] },
    );
    fireEvent.change(await screen.findByLabelText("블로그 주소 또는 피드 주소"), {
      target: { value: "remote.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
    expect(await screen.findByText("최근 글이 없습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("블로그 주소 또는 피드 주소")).toHaveValue(FEED);
    expect(screen.getByLabelText("등록 근거")).toHaveAttribute("aria-required", "true");

    mockBackend({ [ME]: ok(member()), [CREATE]: fail(404, "NOT_FOUND") });
    expect(
      statusOf(
        await caught(
          call({ intent: "create", url: FEED, defaultTopicId: "11", registrationBasis: "x" }),
        ),
      ),
    ).toBe(404);
  });

  it("중복 등록 오류 문구", async () => {
    mockBackend({
      [ME]: ok(member()),
      [CREATE]: failWithParams(409, "EXTERNAL_BLOG_ALREADY_REGISTERED", {
        externalBlogId: 9,
        claimable: false,
      }),
    });
    const result = asData<{ error: { resultCode: string; params: unknown } }>(
      await call({ intent: "create", url: FEED, defaultTopicId: "11", registrationBasis: "x" }),
    );
    expect(result.init?.status).toBe(409);
    expect(result.data.error.params).toEqual({ externalBlogId: 9, claimable: false });
  });
});

function adminPost(id: number) {
  return {
    ...myExternalPost(id),
    guid: `g${id}`,
    imageUrl: null,
    feedTerms: [],
    classifierTopicId: null,
    classifierConfidence: null,
    classifierVersion: "kw-1",
    excluded: null,
    linkCheckedAt: null,
  };
}

describe("상세", () => {
  function renderDetail(blog = adminExternalBlog(3, { status: "PENDING" }), extra = {}) {
    const backend = mockBackend({
      [ME]: ok(member()),
      [DETAIL_3]: ok(blog),
      [POSTS_3]: ok(
        [
          {
            ...myExternalPost(31),
            guid: "g",
            imageUrl: null,
            feedTerms: [],
            classifierTopicId: null,
            classifierConfidence: 0.42,
            classifierVersion: "kw-1",
            excluded: {
              reason: "광고",
              excludedBy: { userId: 1, nickname: "운영자" },
              createdAt: "2026-10-07T00:00:00Z",
            },
            linkCheckedAt: null,
          },
        ],
        { totalCount: 1 },
      ),
      [TOPICS]: ok(externalTopics()),
      ...extra,
    });
    renderRoutes(
      [
        {
          path: "admin/external-blogs/:id",
          loader: stub(detailLoader),
          action: stub(detailAction),
          Component: AdminExternalBlog,
        },
      ],
      { initialEntries: ["/admin/external-blogs/3"] },
    );
    return backend;
  }

  it("승인 대기면 승인·거절 버튼, 거절 사유 필수, 글 표에 제외 사유와 신뢰도", async () => {
    const backend = renderDetail(undefined, {
      [APPROVE_3]: ok(adminExternalBlog(3)),
      [REJECT_3]: ok(adminExternalBlog(3, { status: "REJECTED" })),
    });
    expect(await screen.findByRole("button", { name: "승인" })).toBeInTheDocument();
    expect(screen.getByLabelText("사유")).toBeRequired();
    const table = screen.getByRole("table", { name: "수집된 글" });
    expect(table).toHaveTextContent("제외됨: 광고");
    expect(table).toHaveTextContent("0.42");
    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(await screen.findByText("처리했습니다.")).toBeInTheDocument();
    expect(backend.callsTo(APPROVE_3)).toHaveLength(1);
  });

  it("승인 대기가 아니면 승인·거절 버튼이 없다", async () => {
    renderDetail(adminExternalBlog(3, { status: "ACTIVE", registrationBasis: "public feed" }));
    expect(await screen.findByText("public feed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "승인" })).toBeNull();
    expect(screen.queryByRole("button", { name: "거절" })).toBeNull();
    expect(screen.getByRole("button", { name: "바꾸기" })).toBeInTheDocument();
  });

  it("action: 거절 사유 없으면 400, 기본 주제는 PATCH, 상태 충돌은 409", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [PATCH_3]: ok(adminExternalBlog(3)),
      [APPROVE_3]: failWithParams(409, "EXTERNAL_BLOG_STATE_CONFLICT", {
        status: "ACTIVE",
        action: "approve",
      }),
      [REJECT_3]: ok(adminExternalBlog(3)),
    });
    const call = (fields: Record<string, string>) =>
      detailAction(
        routeArgs<DetailActionArgs>(formRequest("/admin/external-blogs/3", fields, loggedIn), {
          id: "3",
        }),
      );
    expect(asData(await call({ intent: "reject", reason: "  " })).init?.status).toBe(400);
    expect(await call({ intent: "reject", reason: "off topic" })).toEqual({
      intent: "reject",
      ok: true,
    });
    expect(backend.callsTo(REJECT_3)[0].body).toEqual({ reason: "off topic" });
    expect(await call({ intent: "default-topic", defaultTopicId: "12" })).toEqual({
      intent: "default-topic",
      ok: true,
    });
    expect(backend.callsTo(PATCH_3)[0].body).toEqual({ defaultTopicId: 12 });
    expect(asData(await call({ intent: "approve" })).init?.status).toBe(409);
    expect(asData(await call({ intent: "nope" })).init?.status).toBe(400);
  });

  it("상태별 버튼(US4 T077): 수집 중이면 일시 중지·차단, 중지·자동 중지면 재개, 차단·거절이면 없음", async () => {
    const backend = renderDetail(adminExternalBlog(3, { status: "ACTIVE" }), {
      [PAUSE_3]: ok(adminExternalBlog(3, { status: "PAUSED" })),
    });
    expect(await screen.findByRole("button", { name: "일시 중지" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "재개" })).toBeNull();
    expect(screen.getByRole("button", { name: "차단" })).toBeInTheDocument();
    expect(screen.getByLabelText("차단 사유")).toBeRequired();
    expect(screen.getByLabelText("일시 중지 사유(선택)")).not.toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "일시 중지" }));
    await vi.waitFor(() => expect(backend.callsTo(PAUSE_3)).toHaveLength(1));
    expect(backend.callsTo(PAUSE_3)[0].body).toEqual({});
    cleanup();
    vi.restoreAllMocks();

    for (const status of ["PAUSED", "STOPPED"] as const) {
      const { unmount } = render(status);
      expect(await screen.findByRole("button", { name: "재개" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "일시 중지" })).toBeNull();
      unmount();
      vi.restoreAllMocks();
    }
    for (const status of ["BLOCKED", "REJECTED"] as const) {
      const { unmount } = render(status);
      expect(await screen.findByRole("heading", { name: "Remote 3" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "차단" })).toBeNull();
      expect(screen.queryByRole("button", { name: "재개" })).toBeNull();
      unmount();
      vi.restoreAllMocks();
    }

    function render(status: "PAUSED" | "STOPPED" | "BLOCKED" | "REJECTED") {
      mockBackend({
        [ME]: ok(member()),
        [DETAIL_3]: ok(adminExternalBlog(3, { status })),
        [POSTS_3]: ok([], { totalCount: 0 }),
        [TOPICS]: ok([]),
      });
      return renderRoutes(
        [
          {
            path: "admin/external-blogs/:id",
            loader: stub(detailLoader),
            Component: AdminExternalBlog,
          },
        ],
        { initialEntries: ["/admin/external-blogs/3"] },
      );
    }
  });

  it("차단: 확인 문구를 취소하면 보내지 않고, 다른 활성 등록이 있으면 그 등록 링크", async () => {
    const backend = renderDetail(adminExternalBlog(3, { status: "RELEASED", postCount: 2 }), {
      [BLOCK_3]: failWithParams(409, "EXTERNAL_BLOG_STATE_CONFLICT", {
        status: "RELEASED",
        action: "block",
        activeExternalBlogId: 8,
      }),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    fireEvent.change(await screen.findByLabelText("차단 사유"), { target: { value: "피싱" } });
    fireEvent.click(screen.getByRole("button", { name: "차단" }));
    expect(confirm).toHaveBeenCalledWith("모든 글이 포털에서 내려가며 되돌릴 수 없습니다.");
    expect(backend.callsTo(BLOCK_3)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "차단" }));
    expect(await screen.findByRole("link", { name: "#8" })).toHaveAttribute(
      "href",
      "/admin/external-blogs/8",
    );
    expect(backend.callsTo(BLOCK_3)[0].body).toEqual({ reason: "피싱" });
  });

  it("글 표: 제외된 글은 '제외 해제', 아니면 '포털 제외'(사유), '내림'(사유·확인), 내린 글은 조치 없음", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [DETAIL_3]: ok(adminExternalBlog(3)),
      [POSTS_3]: ok(
        [
          { ...adminPost(31), excluded: null },
          {
            ...adminPost(32),
            excluded: {
              reason: "광고",
              excludedBy: { userId: 1, nickname: "운영자" },
              createdAt: "2026-10-07T00:00:00Z",
            },
          },
          { ...adminPost(33), status: "REMOVED" as const, removedReason: "ADMIN" as const },
        ],
        { totalCount: 3 },
      ),
      [TOPICS]: ok(externalTopics()),
      [`PUT ${EXCLUSION_31}`]: ok({}),
      [REMOVE_31]: ok({}),
      "DELETE /api/v1/admin/portal/external-exclusions/32": ok(null),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderRoutes(
      [
        {
          path: "admin/external-blogs/:id",
          loader: stub(detailLoader),
          action: stub(detailAction),
          Component: AdminExternalBlog,
        },
      ],
      { initialEntries: ["/admin/external-blogs/3"] },
    );
    const table = await screen.findByRole("table", { name: "수집된 글" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[3]).queryByRole("button")).toBeNull();
    expect(within(rows[2]).queryByRole("button", { name: "포털 제외" })).toBeNull();
    fireEvent.click(within(rows[2]).getByRole("button", { name: "제외 해제" }));
    await vi.waitFor(() =>
      expect(backend.callsTo("DELETE /api/v1/admin/portal/external-exclusions/32")).toHaveLength(1),
    );

    fireEvent.change(within(table).getByLabelText("External 31 포털 제외 사유"), {
      target: { value: "중복" },
    });
    fireEvent.click(within(table).getAllByRole("button", { name: "포털 제외" })[0]);
    await vi.waitFor(() => expect(backend.callsTo(`PUT ${EXCLUSION_31}`)).toHaveLength(1));
    expect(backend.callsTo(`PUT ${EXCLUSION_31}`)[0].body).toEqual({ reason: "중복" });

    fireEvent.change(within(table).getByLabelText("External 31 내림 사유"), {
      target: { value: "저작권" },
    });
    fireEvent.click(within(table).getAllByRole("button", { name: "내림" })[0]);
    await vi.waitFor(() => expect(backend.callsTo(REMOVE_31)).toHaveLength(1));
    expect(backend.callsTo(REMOVE_31)[0].body).toEqual({ reason: "저작권" });
  });

  it("action: 재개·사유 있는 일시 중지, 차단·내림·포털 제외 사유 필수, 글 번호 필수, 이미 내린 글 409", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [PAUSE_3]: ok(adminExternalBlog(3)),
      [RESUME_3]: ok(adminExternalBlog(3)),
      [BLOCK_3]: ok(adminExternalBlog(3)),
      [REMOVE_31]: failWithParams(409, "EXTERNAL_BLOG_STATE_CONFLICT", {
        status: "REMOVED",
        action: "remove",
      }),
      [`PUT ${EXCLUSION_31}`]: ok({}),
      [`DELETE ${EXCLUSION_31}`]: fail(404, "PORTAL_EXCLUSION_NOT_FOUND"),
    });
    const call = (fields: Record<string, string>) =>
      detailAction(
        routeArgs<DetailActionArgs>(formRequest("/admin/external-blogs/3", fields, loggedIn), {
          id: "3",
        }),
      );
    expect(await call({ intent: "pause", reason: "점검" })).toEqual({ intent: "pause", ok: true });
    expect(backend.callsTo(PAUSE_3)[0].body).toEqual({ reason: "점검" });
    expect(await call({ intent: "resume" })).toEqual({ intent: "resume", ok: true });
    expect(asData(await call({ intent: "block" })).init?.status).toBe(400);
    expect(await call({ intent: "block", reason: "스팸" })).toEqual({ intent: "block", ok: true });
    expect(asData(await call({ intent: "remove", reason: "x" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "remove", postId: "31" })).init?.status).toBe(400);
    const removed = asData<{ postId: number }>(
      await call({ intent: "remove", postId: "31", reason: "x" }),
    );
    expect(removed.init?.status).toBe(409);
    expect(removed.data.postId).toBe(31);
    expect(asData(await call({ intent: "exclude", postId: "31" })).init?.status).toBe(400);
    expect(await call({ intent: "exclude", postId: "31", reason: "광고" })).toEqual({
      intent: "exclude",
      ok: true,
      postId: 31,
    });
    expect(asData(await call({ intent: "unexclude", postId: "31" })).init?.status).toBe(404);
  });

  it("loader: 숫자가 아닌 id는 404, 글 상태 필터", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [DETAIL_3]: ok(adminExternalBlog(3)),
      [POSTS_3]: ok([], { totalCount: 0 }),
      [TOPICS]: ok([]),
    });
    expect(
      statusOf(
        await caught(
          detailLoader(
            routeArgs<DetailArgs>(getRequest("/admin/external-blogs/x", loggedIn), { id: "x" }),
          ),
        ),
      ),
    ).toBe(404);
    await detailLoader(
      routeArgs<DetailArgs>(getRequest("/admin/external-blogs/3?status=REMOVED", loggedIn), {
        id: "3",
      }),
    );
    expect(backend.callsTo(POSTS_3)[0].url.searchParams.get("status")).toBe("REMOVED");
  });
});
