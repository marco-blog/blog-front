// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeedPreview, Verification } from "~/api/models";
import { externalErrorMessage, statusKey } from "~/external/status";
import { createI18n } from "~/i18n/instance";
import { resourcesFor } from "~/i18n/resources.server";
import { loader as entryLoader } from "~/routes/manage-external-entry";
import ManageExternalBlog, {
  action as detailAction,
  loader as detailLoader,
} from "~/routes/manage/external-blog";
import ManageExternalBlogNew, {
  action as newAction,
  loader as newLoader,
  meta as newMeta,
} from "~/routes/manage/external-blog-new";
import ManageExternalBlogs, { loader as listLoader, meta } from "~/routes/manage/external-blogs";

import { fail, failWithParams, mockBackend, ok } from "../support/backend";
import { externalTopics, myExternalBlog, myExternalPost } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
  withCookie,
} from "../support/route";

/** 007 T031: 블로그 관리 "외부 블로그" 목록·신청 단계·상세 */
const ME = "GET /api/v1/me";
const LIST = "GET /api/v1/me/external-blogs";
const TOPICS = "GET /api/v1/topics";
const PREVIEW = "POST /api/v1/external-blog-previews";
const ISSUE = "POST /api/v1/me/external-blog-verifications";
const CHECK_5 = "POST /api/v1/me/external-blog-verifications/5/check";
const CREATE = "POST /api/v1/me/external-blogs";
const CLAIM_9 = "POST /api/v1/external-blogs/9/claim";
const DETAIL_3 = "GET /api/v1/me/external-blogs/3";
const POSTS_3 = "GET /api/v1/me/external-blogs/3/posts";
const CLAIM_3 = "POST /api/v1/external-blogs/3/claim";
const PATCH_MINE_3 = "PATCH /api/v1/me/external-blogs/3";
const POST_TOPIC_31 = "PUT /api/v1/me/external-blogs/3/posts/31/topic";
const RELEASE_3 = "POST /api/v1/me/external-blogs/3/release";
const FEED = "https://remote.example/feed.xml";
const loggedIn = { cookie: "access_token=a" };
const me = {
  userId: 1,
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

const preview = (registered: FeedPreview["registered"] = null): FeedPreview => ({
  feedUrl: FEED,
  siteUrl: "https://remote.example/",
  title: "Remote Blog",
  format: "RSS",
  recentPosts: [
    { title: "First", link: "https://remote.example/1", publishedAt: "2026-10-06T00:00:00Z" },
    { title: "Second", link: "https://remote.example/2", publishedAt: null },
  ],
  registered,
});

const verification = (overrides: Partial<Verification> = {}): Verification => ({
  id: 5,
  feedUrl: FEED,
  code: "java21-verify-AbCdEf123456",
  expiresAt: "2026-10-08T00:00:00Z",
  verifiedAt: null,
  claimableExternalBlogId: null,
  ...overrides,
});

type ListArgs = Parameters<typeof listLoader>[0];
type NewLoaderArgs = Parameters<typeof newLoader>[0];
type NewActionArgs = Parameters<typeof newAction>[0];
type DetailArgs = Parameters<typeof detailLoader>[0];
type DetailActionArgs = Parameters<typeof detailAction>[0];
type EntryArgs = Parameters<typeof entryLoader>[0];

afterEach(() => {
  vi.restoreAllMocks();
});

const t = createI18n("ko", resourcesFor("ko")).t;

describe("도우미", () => {
  it("상태 배지: 해제 + 남긴 글이면 '해제 · 글 남김'", () => {
    expect(statusKey({ status: "RELEASED", postCount: 2 })).toBe("external:status.RELEASED_KEPT");
    expect(statusKey({ status: "RELEASED", postCount: 0 })).toBe("external:status.RELEASED");
    expect(statusKey({ status: "ACTIVE", postCount: 2 })).toBe("external:status.ACTIVE");
  });

  it("오류 문구: 이유·결과·찾아본 곳별", () => {
    const base = { field: null, fieldErrors: [] };
    expect(
      externalErrorMessage(t, {
        ...base,
        resultCode: "EXTERNAL_FEED_URL_NOT_ALLOWED",
        params: { reason: "SELF" },
      }),
    ).toBe("우리 서비스 블로그는 등록할 수 없습니다.");
    expect(
      externalErrorMessage(t, {
        ...base,
        resultCode: "EXTERNAL_FEED_URL_NOT_ALLOWED",
        params: { reason: "PRIVATE_ADDRESS" },
      }),
    ).toBe("내부망 주소는 등록할 수 없습니다.");
    expect(
      externalErrorMessage(t, {
        ...base,
        resultCode: "EXTERNAL_FEED_NOT_FOUND",
        params: { tried: ["a", "b", "c"] },
      }),
    ).toContain("주소 3곳");
    expect(
      externalErrorMessage(t, {
        ...base,
        resultCode: "EXTERNAL_FEED_UNREADABLE",
        params: { result: "HTTP_ERROR", httpStatus: 404 },
      }),
    ).toBe("피드를 읽지 못했습니다: HTTP 404");
    expect(
      externalErrorMessage(t, {
        ...base,
        resultCode: "EXTERNAL_FEED_UNREADABLE",
        params: { result: "TIMEOUT" },
      }),
    ).toContain("시간");
    expect(
      externalErrorMessage(t, {
        ...base,
        resultCode: "EXTERNAL_BLOG_ALREADY_REGISTERED",
        params: { claimable: false },
      }),
    ).toBe("이미 등록된 블로그입니다(넘겨받을 수 없음).");
    expect(
      externalErrorMessage(t, {
        ...base,
        resultCode: "EXTERNAL_BLOG_ALREADY_REGISTERED",
        params: { mine: true },
      }),
    ).toBe("이미 신청한 블로그입니다.");
    const notFound = externalErrorMessage(t, {
      ...base,
      resultCode: "EXTERNAL_VERIFICATION_CODE_NOT_FOUND",
      params: { checked: ["FEED", "SITE"], failures: { SITE: "TIMEOUT" } },
    });
    expect(notFound).toContain("피드: 코드 없음");
    expect(notFound).toContain("블로그 첫 화면:");
    expect(externalErrorMessage(t, { ...base, resultCode: "EXTERNAL_BLOG_LIMIT_EXCEEDED" })).toBe(
      t("errors:EXTERNAL_BLOG_LIMIT_EXCEEDED"),
    );
  });
});

describe("목록", () => {
  it("loader는 내 외부 블로그를 읽고, 거절·해제를 뺀 3개면 신청을 끈다", async () => {
    const blogs = [
      myExternalBlog(1),
      myExternalBlog(2, { status: "PENDING" }),
      myExternalBlog(3, { status: "BLOCKED" }),
      myExternalBlog(4, { status: "REJECTED" }),
    ];
    mockBackend({ [ME]: ok(me), [LIST]: ok(blogs) });
    const data = await listLoader(
      routeArgs<ListArgs>(getRequest("/marco/manage/external-blogs", loggedIn), {
        handle: "marco",
      }),
    );
    expect(data.atLimit).toBe(true);

    mockBackend({ [ME]: ok(me), [LIST]: ok(blogs) });
    expect(
      statusOf(
        await caught(
          listLoader(
            routeArgs<ListArgs>(getRequest("/other/manage/external-blogs", loggedIn), {
              handle: "other",
            }),
          ),
        ),
      ),
    ).toBe(404);
  });

  it("상태 배지·거절 사유·한도면 비활성 버튼", async () => {
    mockBackend({
      [ME]: ok(me),
      [LIST]: ok([
        myExternalBlog(1, { status: "REJECTED", rejectReason: "주제와 무관" }),
        myExternalBlog(2, { status: "RELEASED", postCount: 4 }),
        myExternalBlog(3, { status: "PENDING", ownershipVerified: true }),
        myExternalBlog(4, { status: "ACTIVE" }),
        myExternalBlog(5, { status: "STOPPED", lastFetchResult: "TIMEOUT" }),
      ]),
    });
    renderRoutes(
      [
        {
          path: ":handle/manage/external-blogs",
          loader: withCookie(listLoader as never) as never,
          Component: ManageExternalBlogs,
        },
      ],
      { initialEntries: ["/marco/manage/external-blogs"] },
    );
    const table = await screen.findByRole("table", { name: "내 외부 블로그" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("거절");
    expect(rows[0]).toHaveTextContent("사유: 주제와 무관");
    expect(rows[1]).toHaveTextContent("해제 · 글 남김");
    expect(rows[2]).toHaveTextContent("소유 인증됨");
    expect(within(rows[0]).getByRole("link", { name: "Remote 1" })).toHaveAttribute(
      "href",
      "/marco/manage/external-blogs/1",
    );
    expect(screen.getByRole("button", { name: "외부 블로그 등록 신청" })).toBeDisabled();
  });

  it("빈 목록이면 안내와 신청 링크", async () => {
    mockBackend({ [ME]: ok(me), [LIST]: ok([]) });
    renderRoutes(
      [
        {
          path: ":handle/manage/external-blogs",
          loader: withCookie(listLoader as never) as never,
          Component: ManageExternalBlogs,
        },
      ],
      { initialEntries: ["/marco/manage/external-blogs"] },
    );
    expect(await screen.findByText("등록한 외부 블로그가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "외부 블로그 등록 신청" })).toHaveAttribute(
      "href",
      "/marco/manage/external-blogs/new",
    );
  });

  it("meta는 noindex", () => {
    expect(meta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as never)).toContainEqual(
      { name: "robots", content: "noindex" },
    );
    expect(
      newMeta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as never),
    ).toContainEqual({ name: "robots", content: "noindex" });
  });
});

describe("신청 loader·action", () => {
  const call = (fields: Record<string, string>) =>
    newAction(
      routeArgs<NewActionArgs>(formRequest("/marco/manage/external-blogs/new", fields, loggedIn), {
        handle: "marco",
      }),
    );

  it("loader: ?step=topic이면 주제를 읽고, 주소가 없으면 첫 단계", async () => {
    const backend = mockBackend({ [ME]: ok(me), [TOPICS]: ok(externalTopics()) });
    const args = (url: string) =>
      routeArgs<NewLoaderArgs>(getRequest(url, loggedIn), { handle: "marco" });
    const topic = await newLoader(
      args(`/marco/manage/external-blogs/new?step=topic&feedUrl=${FEED}&verificationId=5`),
    );
    expect(topic.state).toMatchObject({ step: "topic", feedUrl: FEED, verificationId: 5 });
    expect(topic.topics).toHaveLength(1);
    const first = await newLoader(args("/marco/manage/external-blogs/new?step=topic"));
    expect(first.state.step).toBe("preview");
    expect(backend.callsTo(TOPICS)).toHaveLength(1);
  });

  it("preview → 다음 단계, 실패는 params와 함께", async () => {
    const backend = mockBackend({ [ME]: ok(me), [PREVIEW]: ok(preview()) });
    const result = (await call({ intent: "preview", url: " remote.example " })) as {
      state: { step: string; feedUrl: string };
    };
    expect(result.state).toMatchObject({ step: "verify", feedUrl: FEED });
    expect(backend.callsTo(PREVIEW)[0].body).toEqual({ url: "remote.example" });

    mockBackend({
      [ME]: ok(me),
      [PREVIEW]: failWithParams(422, "EXTERNAL_FEED_URL_NOT_ALLOWED", { reason: "SELF" }),
    });
    const failed = asData<{ ok: boolean; error: { params: unknown }; state: { step: string } }>(
      await call({ intent: "preview", url: "http://localhost:5173/marco" }),
    );
    expect(failed.init?.status).toBe(422);
    expect(failed.data.error.params).toEqual({ reason: "SELF" });
    expect(failed.data.state.step).toBe("preview");
  });

  it("issue-code·check, 확인 실패면 코드를 되살린다", async () => {
    mockBackend({ [ME]: ok(me), [ISSUE]: ok(verification(), { status: 201 }) });
    const issued = (await call({ intent: "issue-code", feedUrl: FEED })) as {
      state: { verification: Verification };
    };
    expect(issued.state.verification.code).toBe("java21-verify-AbCdEf123456");

    const backend = mockBackend({
      [ME]: ok(me),
      [CHECK_5]: failWithParams(422, "EXTERNAL_VERIFICATION_CODE_NOT_FOUND", {
        checked: ["FEED", "SITE"],
        failures: {},
      }),
    });
    const failed = asData<{ state: { verification: Verification } }>(
      await call({
        intent: "check",
        feedUrl: FEED,
        verificationId: "5",
        code: "java21-verify-AbCdEf123456",
        expiresAt: "2026-10-08T00:00:00Z",
      }),
    );
    expect(failed.data.state.verification).toMatchObject({ id: 5, verifiedAt: null });
    expect(backend.callsTo(CHECK_5)[0].body).toEqual({ feedUrl: FEED });

    mockBackend({ [ME]: ok(me) });
    expect(asData(await call({ intent: "check", feedUrl: FEED })).init?.status).toBe(400);
    expect(asData(await call({ intent: "nope" })).init?.status).toBe(400);
  });

  it("submit은 상세로 리다이렉트, claim도", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [CREATE]: ok(myExternalBlog(3), { status: 201 }),
      [CLAIM_9]: ok(myExternalBlog(9)),
    });
    expect(
      expectRedirect(
        await caught(
          call({ intent: "submit", feedUrl: FEED, defaultTopicId: "11", verificationId: "5" }),
        ),
      ),
    ).toBe("/marco/manage/external-blogs/3");
    expect(backend.callsTo(CREATE)[0].body).toEqual({
      feedUrl: FEED,
      defaultTopicId: 11,
      verificationId: 5,
    });
    expect(
      expectRedirect(
        await caught(call({ intent: "claim", externalBlogId: "9", verificationId: "5" })),
      ),
    ).toBe("/marco/manage/external-blogs/9");

    mockBackend({
      [ME]: ok(me),
      [CREATE]: failWithParams(409, "EXTERNAL_BLOG_ALREADY_REGISTERED", {
        externalBlogId: 9,
        claimable: true,
        mine: false,
      }),
    });
    const dup = asData<{ state: { step: string } }>(
      await call({ intent: "submit", feedUrl: FEED, defaultTopicId: "11" }),
    );
    expect(dup.init?.status).toBe(409);
    expect(dup.data.state.step).toBe("topic");
  });
});

describe("신청 화면", () => {
  function renderNew(extra: Record<string, Response | (() => Response)>, entry = "") {
    const backend = mockBackend({ [ME]: ok(me), [TOPICS]: ok(externalTopics()), ...extra });
    renderRoutes(
      [
        {
          path: ":handle/manage/external-blogs/new",
          loader: withCookie(newLoader as never) as never,
          action: withCookie(newAction as never) as never,
          Component: ManageExternalBlogNew,
        },
      ],
      { initialEntries: [`/marco/manage/external-blogs/new${entry}`] },
    );
    return backend;
  }

  it("미리보기 → 코드 발급 → 확인 실패 이유 → 확인 성공 → 다음 단계 링크", async () => {
    let checkReply: () => Response = () =>
      failWithParams(422, "EXTERNAL_VERIFICATION_CODE_NOT_FOUND", {
        checked: ["FEED", "SITE"],
        failures: { SITE: "TIMEOUT" },
      });
    renderNew({
      [PREVIEW]: ok(preview()),
      [ISSUE]: ok(verification(), { status: 201 }),
      [CHECK_5]: () => checkReply(),
    });
    fireEvent.change(await screen.findByLabelText("블로그 주소 또는 피드 주소"), {
      target: { value: "remote.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
    expect(await screen.findByText("Remote Blog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "First" })).toHaveAttribute(
      "href",
      "https://remote.example/1",
    );
    expect(screen.getByRole("link", { name: "건너뛰기(추천하는 다른 블로그)" })).toHaveAttribute(
      "href",
      `/marco/manage/external-blogs/new?step=topic&feedUrl=${encodeURIComponent(FEED)}`,
    );

    fireEvent.click(screen.getByRole("button", { name: "인증 코드 받기" }));
    expect(await screen.findByText("java21-verify-AbCdEf123456")).toBeInTheDocument();
    expect(screen.getByText(/까지 유효합니다/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "인증 확인" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("블로그 첫 화면:");
    expect(screen.getByText("java21-verify-AbCdEf123456")).toBeInTheDocument();

    checkReply = () => ok(verification({ verifiedAt: "2026-10-07T01:00:00Z" }));
    fireEvent.click(screen.getByRole("button", { name: "인증 확인" }));
    expect(await screen.findByText("소유 인증을 마쳤습니다.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute(
      "href",
      `/marco/manage/external-blogs/new?step=topic&feedUrl=${encodeURIComponent(FEED)}&verificationId=5`,
    );
  });

  it("이미 등록된 블로그: 넘겨받기 안내, 인증 후 넘겨받기 폼", async () => {
    renderNew({
      [PREVIEW]: ok(preview({ externalBlogId: 9, status: "ACTIVE", claimable: true, mine: false })),
      [ISSUE]: ok(verification(), { status: 201 }),
      [CHECK_5]: ok(
        verification({ verifiedAt: "2026-10-07T01:00:00Z", claimableExternalBlogId: 9 }),
      ),
    });
    fireEvent.change(await screen.findByLabelText("블로그 주소 또는 피드 주소"), {
      target: { value: "remote.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
    expect(
      await screen.findByText(
        "이미 등록된 블로그입니다. 내 블로그라면 소유 인증 후 넘겨받을 수 있습니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "건너뛰기(추천하는 다른 블로그)" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "인증 코드 받기" }));
    fireEvent.click(await screen.findByRole("button", { name: "인증 확인" }));
    expect(await screen.findByRole("button", { name: "넘겨받기" })).toBeInTheDocument();
  });

  it("넘겨받을 수 없는 블로그면 인증 없이 처음부터", async () => {
    renderNew({
      [PREVIEW]: ok(
        preview({ externalBlogId: 9, status: "BLOCKED", claimable: false, mine: false }),
      ),
    });
    fireEvent.change(await screen.findByLabelText("블로그 주소 또는 피드 주소"), {
      target: { value: "remote.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
    expect(
      await screen.findByText("이미 등록된 블로그입니다. 넘겨받을 수 없습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "인증 코드 받기" })).toBeNull();
    expect(screen.getByRole("link", { name: "처음부터" })).toBeInTheDocument();
  });

  it("주소 오류는 이유별 문구", async () => {
    renderNew({
      [PREVIEW]: failWithParams(422, "EXTERNAL_FEED_URL_NOT_ALLOWED", { reason: "SELF" }),
    });
    fireEvent.change(await screen.findByLabelText("블로그 주소 또는 피드 주소"), {
      target: { value: "http://localhost:5173/marco" },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "우리 서비스 블로그는 등록할 수 없습니다.",
    );
  });

  it("JS 없이 ?step=topic: 주제 고르고 신청하면 상세로", async () => {
    const backend = renderNew(
      { [CREATE]: ok(myExternalBlog(3), { status: 201 }) },
      `?step=topic&feedUrl=${encodeURIComponent(FEED)}`,
    );
    const select = await screen.findByLabelText("기본 주제");
    expect(within(select).getByRole("group", { name: "knowledge 한" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "신청" }));
    await vi.waitFor(() => expect(backend.callsTo(CREATE)).toHaveLength(1));
    expect(backend.callsTo(CREATE)[0].body).toEqual({
      feedUrl: FEED,
      defaultTopicId: 12,
      verificationId: null,
    });
  });

  it("한도 초과·중복 오류를 주제 단계에서 보인다", async () => {
    renderNew(
      {
        [CREATE]: failWithParams(409, "EXTERNAL_BLOG_ALREADY_REGISTERED", {
          externalBlogId: 9,
          claimable: true,
          mine: false,
        }),
      },
      `?step=topic&feedUrl=${encodeURIComponent(FEED)}`,
    );
    fireEvent.change(await screen.findByLabelText("기본 주제"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "신청" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미 등록된 블로그입니다. 소유 인증을 하면 넘겨받을 수 있습니다.",
    );
    expect(screen.getByRole("link", { name: "내 블로그입니다 — 인증하기" })).toHaveAttribute(
      "href",
      `/marco/manage/external-blogs/new?step=verify&feedUrl=${encodeURIComponent(FEED)}`,
    );
  });
});

describe("상세", () => {
  it("loader: 남의 등록(404)은 404, 숫자가 아닌 id도 404", async () => {
    mockBackend({
      [ME]: ok(me),
      [DETAIL_3]: fail(404, "EXTERNAL_BLOG_NOT_FOUND"),
      [POSTS_3]: fail(404, "EXTERNAL_BLOG_NOT_FOUND"),
      [TOPICS]: ok([]),
    });
    const args = (id: string) =>
      routeArgs<DetailArgs>(getRequest(`/marco/manage/external-blogs/${id}`, loggedIn), {
        handle: "marco",
        id,
      });
    expect(statusOf(await caught(detailLoader(args("3"))))).toBe(404);
    expect(statusOf(await caught(detailLoader(args("x"))))).toBe(404);
  });

  it("상태 안내·수집된 글 표(원문 새 탭, 주제와 출처), 미인증이면 코드 발급", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [DETAIL_3]: ok(myExternalBlog(3, { status: "STOPPED", lastFetchResult: "TIMEOUT" })),
      [POSTS_3]: ok(
        [
          myExternalPost(31, { topicSource: "AUTO", topicId: 12 }),
          myExternalPost(32, { status: "REMOVED", removedReason: "ADMIN" }),
        ],
        { totalCount: 2 },
      ),
      [TOPICS]: ok(externalTopics()),
      [ISSUE]: ok(verification(), { status: 201 }),
      [CHECK_5]: ok(verification({ verifiedAt: "2026-10-07T01:00:00Z" })),
      [CLAIM_3]: ok(myExternalBlog(3, { ownershipVerified: true })),
    });
    renderRoutes(
      [
        {
          path: ":handle/manage/external-blogs/:id",
          loader: withCookie(detailLoader as never) as never,
          action: withCookie(detailAction as never) as never,
          Component: ManageExternalBlog,
        },
      ],
      { initialEntries: ["/marco/manage/external-blogs/3"] },
    );
    expect(await screen.findByRole("heading", { name: "Remote 3" })).toBeInTheDocument();
    expect(screen.getByText(/마지막 결과: 응답 시간 초과/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "수집된 글" });
    const link = within(table).getByRole("link", { name: "External 31" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener nofollow noreferrer");
    expect(table).toHaveTextContent("knowledge 한 › science 한 자동");
    expect(
      screen.getByText("소유 인증을 하면 기본 주제와 글 주제를 바꿀 수 있습니다."),
    ).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "바꾸기" })).toBeNull();
    expect(table).toHaveTextContent("내림 · 운영자");

    fireEvent.click(screen.getByRole("button", { name: "인증 코드 받기" }));
    fireEvent.click(await screen.findByRole("button", { name: "인증 확인" }));
    await vi.waitFor(() => expect(backend.callsTo(CLAIM_3)).toHaveLength(1));
    expect(backend.callsTo(CLAIM_3)[0].body).toEqual({ verificationId: 5 });
  });

  it("인증된 주인: 기본 주제·글 주제 바꾸기(T070), 해제된 등록은 폼이 없다", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [DETAIL_3]: ok(myExternalBlog(3, { ownershipVerified: true, defaultTopicId: 11 })),
      [POSTS_3]: ok(
        [
          myExternalPost(31, { topicSource: "AUTO", topicId: 12 }),
          myExternalPost(32, { status: "REMOVED", removedReason: "ADMIN" }),
        ],
        { totalCount: 2 },
      ),
      [TOPICS]: ok(externalTopics()),
      [PATCH_MINE_3]: ok(myExternalBlog(3, { ownershipVerified: true, defaultTopicId: 12 })),
      [POST_TOPIC_31]: ok(myExternalPost(31, { topicSource: "OWNER", topicId: 11 })),
    });
    renderRoutes(
      [
        {
          path: ":handle/manage/external-blogs/:id",
          loader: withCookie(detailLoader as never) as never,
          action: withCookie(detailAction as never) as never,
          Component: ManageExternalBlog,
        },
      ],
      { initialEntries: ["/marco/manage/external-blogs/3"] },
    );
    const table = await screen.findByRole("table", { name: "수집된 글" });
    expect(within(table).getAllByRole("button", { name: "바꾸기" })).toHaveLength(1);
    const select = within(table).getByLabelText("External 31 주제");
    expect(select).toHaveValue("12");
    expect(within(table).getByText("자동")).toHaveClass("topic-source", "topic-source-auto");
    fireEvent.change(select, { target: { value: "11" } });
    fireEvent.click(within(table).getByRole("button", { name: "바꾸기" }));
    await vi.waitFor(() => expect(backend.callsTo(POST_TOPIC_31)).toHaveLength(1));
    expect(backend.callsTo(POST_TOPIC_31)[0].body).toEqual({ topicId: 11 });
    expect(await screen.findByText("저장했습니다.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("기본 주제"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await vi.waitFor(() => expect(backend.callsTo(PATCH_MINE_3)).toHaveLength(1));
    expect(backend.callsTo(PATCH_MINE_3)[0].body).toEqual({ defaultTopicId: 12 });
  });

  it("해제된 등록은 주제 폼도 인증 안내도 없다", async () => {
    mockBackend({
      [ME]: ok(me),
      [DETAIL_3]: ok(myExternalBlog(3, { ownershipVerified: true, status: "RELEASED" })),
      [POSTS_3]: ok([myExternalPost(31)], { totalCount: 1 }),
      [TOPICS]: ok(externalTopics()),
    });
    renderRoutes(
      [
        {
          path: ":handle/manage/external-blogs/:id",
          loader: withCookie(detailLoader as never) as never,
          Component: ManageExternalBlog,
        },
      ],
      { initialEntries: ["/marco/manage/external-blogs/3"] },
    );
    const table = await screen.findByRole("table", { name: "수집된 글" });
    expect(within(table).queryByRole("button", { name: "바꾸기" })).toBeNull();
    expect(screen.queryByLabelText("기본 주제")).toBeNull();
    expect(screen.queryByText(/소유 인증을 하면/)).toBeNull();
  });

  it("action: 주제 값 검사, 미인증 403 문구, 성공하면 postId", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [PATCH_MINE_3]: fail(403, "EXTERNAL_BLOG_OWNERSHIP_REQUIRED"),
      [POST_TOPIC_31]: ok(myExternalPost(31, { topicSource: "OWNER" })),
    });
    const call = (fields: Record<string, string>) =>
      detailAction(
        routeArgs<DetailActionArgs>(
          formRequest("/marco/manage/external-blogs/3", fields, loggedIn),
          { handle: "marco", id: "3" },
        ),
      );
    expect(asData(await call({ intent: "default-topic", defaultTopicId: "" })).init?.status).toBe(
      400,
    );
    const denied = asData<{ error: { resultCode: string } }>(
      await call({ intent: "default-topic", defaultTopicId: "12" }),
    );
    expect(denied.init?.status).toBe(403);
    expect(denied.data.error.resultCode).toBe("EXTERNAL_BLOG_OWNERSHIP_REQUIRED");
    expect(asData(await call({ intent: "post-topic", topicId: "11" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "post-topic", postId: "31" })).init?.status).toBe(400);
    expect(await call({ intent: "post-topic", postId: "31", topicId: "11" })).toEqual({
      intent: "post-topic",
      ok: true,
      verification: null,
      postId: 31,
    });
    expect(backend.callsTo(POST_TOPIC_31)[0].body).toEqual({ topicId: 11 });
  });

  it("action: 잘못된 intent는 400", async () => {
    mockBackend({ [ME]: ok(me) });
    const result = await detailAction(
      routeArgs<DetailActionArgs>(
        formRequest("/marco/manage/external-blogs/3", { intent: "nope" }, loggedIn),
        { handle: "marco", id: "3" },
      ),
    );
    expect(asData(result).init?.status).toBe(400);
  });
});

describe("등록 해제(US4 T077)", () => {
  const detailRoute = [
    {
      path: ":handle/manage/external-blogs/:id",
      loader: withCookie(detailLoader as never) as never,
      action: withCookie(detailAction as never) as never,
      Component: ManageExternalBlog,
    },
  ];

  it("라디오 두 개는 기본 선택 없음, 고르지 않고 해제하면 '골라 주세요', 고른 쪽의 확인 문구 뒤 해제", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [DETAIL_3]: ok(myExternalBlog(3)),
      [POSTS_3]: ok([myExternalPost(31)], { totalCount: 1 }),
      [TOPICS]: ok(externalTopics()),
      [RELEASE_3]: ok(myExternalBlog(3, { status: "RELEASED", postCount: 0 })),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    renderRoutes(detailRoute, { initialEntries: ["/marco/manage/external-blogs/3"] });
    const keep = await screen.findByRole("radio", { name: /수집된 글 남기기/ });
    const remove = screen.getByRole("radio", { name: /수집된 글 삭제/ });
    expect(keep).not.toBeChecked();
    expect(remove).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "해제" }));
    expect(await screen.findByText("남길지 삭제할지 골라 주세요.")).toBeInTheDocument();
    expect(backend.callsTo(RELEASE_3)).toHaveLength(0);

    fireEvent.click(remove);
    fireEvent.click(screen.getByRole("button", { name: "해제" }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("되돌릴 수 없습니다"));
    expect(backend.callsTo(RELEASE_3)).toHaveLength(0);

    fireEvent.click(screen.getByRole("radio", { name: /수집된 글 남기기/ }));
    fireEvent.click(screen.getByRole("button", { name: "해제" }));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining("새 글은 더 가져오지"));
    await vi.waitFor(() => expect(backend.callsTo(RELEASE_3)).toHaveLength(1));
    expect(backend.callsTo(RELEASE_3)[0].body).toEqual({ deletePosts: false });
    expect(await screen.findByText("등록을 해제했습니다.")).toBeInTheDocument();
  });

  it("해제된 등록: 남긴 글이 있으면 '남긴 글 삭제'(확인), 없으면 숨김, 주제 바꾸기 없음", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [DETAIL_3]: ok(
        myExternalBlog(3, { status: "RELEASED", ownershipVerified: true, postCount: 2 }),
      ),
      [POSTS_3]: ok([myExternalPost(31)], { totalCount: 1 }),
      [TOPICS]: ok(externalTopics()),
      [RELEASE_3]: ok(myExternalBlog(3, { status: "RELEASED", postCount: 0 })),
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderRoutes(detailRoute, { initialEntries: ["/marco/manage/external-blogs/3"] });
    expect(await screen.findByText("해제됨 · 남긴 글 2편이 포털에 보이는 중")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByLabelText("기본 주제")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "남긴 글 삭제" }));
    await vi.waitFor(() => expect(backend.callsTo(RELEASE_3)).toHaveLength(1));
    expect(backend.callsTo(RELEASE_3)[0].body).toEqual({ deletePosts: true });
  });

  it("해제된 등록에 남긴 글이 없거나 차단·거절이면 해제 폼이 없다, 자동 중지면 운영자 재개 안내", async () => {
    for (const blog of [
      myExternalBlog(3, { status: "RELEASED", postCount: 0 }),
      myExternalBlog(3, { status: "BLOCKED" }),
      myExternalBlog(3, { status: "REJECTED", rejectReason: "x" }),
    ]) {
      mockBackend({
        [ME]: ok(me),
        [DETAIL_3]: ok(blog),
        [POSTS_3]: ok([], { totalCount: 0 }),
        [TOPICS]: ok(externalTopics()),
      });
      const { unmount } = renderRoutes(detailRoute, {
        initialEntries: ["/marco/manage/external-blogs/3"],
      });
      expect(await screen.findByRole("heading", { name: "Remote 3" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "해제" })).toBeNull();
      expect(screen.queryByRole("button", { name: "남긴 글 삭제" })).toBeNull();
      unmount();
      vi.restoreAllMocks();
    }
    mockBackend({
      [ME]: ok(me),
      [DETAIL_3]: ok(myExternalBlog(3, { status: "STOPPED", lastFetchResult: "HTTP_ERROR" })),
      [POSTS_3]: ok([], { totalCount: 0 }),
      [TOPICS]: ok(externalTopics()),
    });
    renderRoutes(detailRoute, { initialEntries: ["/marco/manage/external-blogs/3"] });
    expect(await screen.findByText(/피드가 다시 열리면 운영자가 재개합니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "해제" })).toBeInTheDocument();
  });

  it("action: 선택이 없으면 400(deletePosts), 409는 오류로", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [RELEASE_3]: failWithParams(409, "EXTERNAL_BLOG_STATE_CONFLICT", {
        status: "BLOCKED",
        action: "release",
      }),
    });
    const call = (fields: Record<string, string>) =>
      detailAction(
        routeArgs<DetailActionArgs>(
          formRequest("/marco/manage/external-blogs/3", fields, loggedIn),
          { handle: "marco", id: "3" },
        ),
      );
    const missing = asData<{ error: { fieldErrors: { field: string }[] } }>(
      await call({ intent: "release", deletePosts: "maybe" }),
    );
    expect(missing.init?.status).toBe(400);
    expect(missing.data.error.fieldErrors[0].field).toBe("deletePosts");
    expect(backend.callsTo(RELEASE_3)).toHaveLength(0);
    const conflict = asData(await call({ intent: "release", deletePosts: "true" }));
    expect(conflict.init?.status).toBe(409);
    expect(backend.callsTo(RELEASE_3)[0].body).toEqual({ deletePosts: true });
  });
});

describe("알림 링크 진입점", () => {
  it("최근 블로그의 외부 블로그 관리로", async () => {
    mockBackend({ [ME]: ok(me) });
    const go = (path: string, id?: string) =>
      entryLoader(routeArgs<EntryArgs>(getRequest(path, loggedIn), { id }));
    expect(expectRedirect(await caught(go("/manage/external-blogs/3", "3")))).toBe(
      "/marco/manage/external-blogs/3",
    );
    expect(expectRedirect(await caught(go("/manage/external-blogs")))).toBe(
      "/marco/manage/external-blogs",
    );
    expect(expectRedirect(await caught(go("/manage/external-blogs/x", "x")))).toBe(
      "/marco/manage/external-blogs",
    );
    mockBackend({ [ME]: ok({ ...me, blogs: [] }) });
    expect(expectRedirect(await caught(go("/manage/external-blogs")))).not.toContain(
      "external-blogs",
    );
  });
});
