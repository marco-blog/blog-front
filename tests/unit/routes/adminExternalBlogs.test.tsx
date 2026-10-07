// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
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
