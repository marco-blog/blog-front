// @vitest-environment jsdom
import type { TrackbackPing } from "~/api/models";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import Write, { AUTOSAVE_INTERVAL_MS, action, loader, meta } from "~/routes/write";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { blog, postDetail, topicNode } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
} from "../support/route";

// 에디터(Milkdown Crepe)는 브라우저 전용이라 이 테스트에서는 같은 인터페이스의 입력란으로 바꾼다.
// `editor.unreported`는 에디터에 들어갔지만 아직 onChange로 알리지 않은 내용(Milkdown은 알림을 늦춰 보낸다)이다.
const ping: TrackbackPing = {
  id: 1,
  targetUrl: "https://other.example/tb/1",
  status: "SUCCESS",
  errorCode: null,
  errorMessage: null,
  attemptedAt: "2026-10-06T05:00:00Z",
  createdAt: "2026-10-06T05:00:00Z",
};
const editor = vi.hoisted(() => ({ unreported: null as string | null }));
vi.mock("~/components/Editor/Editor", async () => {
  const { useImperativeHandle } = await import("react");
  return {
    Editor: ({
      value,
      onChange,
      ref,
    }: {
      value: string;
      onChange: (markdown: string) => void;
      ref?: React.Ref<{ getMarkdown: () => string | null }>;
    }) => {
      useImperativeHandle(ref, () => ({ getMarkdown: () => editor.unreported }));
      return (
        <textarea
          aria-label="본문"
          defaultValue={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    },
  };
});

type LoaderArgs = Parameters<typeof loader>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const ME = "GET /api/v1/me";
const me = {
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [
    { handle: "marco", title: "마르코의 블로그" },
    { handle: "marco-dev", title: "개발 블로그" },
  ],
  unseenReleaseNote: null,
};
const LATEST = "GET /api/v1/blogs/marco/posts/drafts/latest";
const CATEGORIES = "GET /api/v1/blogs/marco/categories";
const tree = [
  {
    id: 12,
    name: "Spring",
    postCount: 3,
    children: [{ id: 13, name: "JPA", postCount: 1, children: [] }],
  },
  { id: 20, name: "일상", postCount: 0, children: [] },
];
const CREATE_DRAFT = "POST /api/v1/blogs/marco/posts/drafts";
const TOPICS = "GET /api/v1/topics";
const topics = [topicNode(1, "dev", {}, [topicNode(11, "java", { parentId: 1 })])];
const loggedIn = { cookie: "access_token=a" };

afterEach(() => {
  vi.useRealTimers();
  editor.unreported = null;
});

const callLoader = (path: string, params: Record<string, string>, headers = loggedIn) =>
  loader(routeArgs<LoaderArgs>(getRequest(path, headers), params));

describe("write loader", () => {
  it("비로그인은 /login?next=로", async () => {
    mockBackend({ [ME]: fail(401, "UNAUTHENTICATED") });

    const thrown = await caught(callLoader("/marco/write", { handle: "marco" }));

    const location = new URL(expectRedirect(thrown), "http://front.test");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/marco/write");
  });

  it("내 블로그가 아니면 404", async () => {
    const backend = mockBackend({ [ME]: ok(me) });

    expect(statusOf(await caught(callLoader("/other/write", { handle: "other" })))).toBe(404);
    expect(backend.calls.map((call) => call.path)).toEqual(["/api/v1/me"]);
  });

  it("새 글: 이 블로그의 최근 임시저장을 함께 넘기고 last_blog 쿠키를 저장한다", async () => {
    const latest = { id: 55, title: "쓰던 글", savedAt: "2026-10-06T04:24:19Z" };
    mockBackend({
      [ME]: ok(me),
      [LATEST]: ok(latest),
      [CATEGORIES]: ok(tree),
      [TOPICS]: ok(topics),
      "GET /api/v1/blogs/marco": ok({ ...blog, defaultTopicId: 11 }),
    });
    const request = getRequest("/marco/write", loggedIn);

    const result = await loader(routeArgs<LoaderArgs>(request, { handle: "marco" }));

    expect(result).toEqual({
      handle: "marco",
      post: null,
      draft: null,
      latestDraft: latest,
      categories: tree,
      topics,
      defaultTopicId: 11,
    });
    expect(responseCookies(request)).toEqual([
      expect.stringMatching(/^last_blog=marco; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax/),
    ]);
  });

  it("새 글: 임시저장이 없으면(null) 묻지 않는다", async () => {
    mockBackend({ [ME]: ok(me), [LATEST]: ok(null), [CATEGORIES]: ok([]) });

    await expect(callLoader("/marco/write", { handle: "marco" })).resolves.toMatchObject({
      latestDraft: null,
    });
  });

  it("새 글: 주제 트리·블로그를 못 읽어도 연다(주제 고르기만 비고 기본 주제 없음)", async () => {
    mockBackend({
      [ME]: ok(me),
      [LATEST]: ok(null),
      [CATEGORIES]: ok([]),
      [TOPICS]: fail(500, "INTERNAL_ERROR"),
      "GET /api/v1/blogs/marco": fail(500, "INTERNAL_ERROR"),
    });

    await expect(callLoader("/marco/write", { handle: "marco" })).resolves.toMatchObject({
      topics: [],
      defaultTopicId: null,
    });
  });

  it("글 수정: 작성 중 사본(카테고리·태그 포함)과 글 상태, 카테고리 트리를 불러온다", async () => {
    mockBackend({
      [ME]: ok(me),
      [CATEGORIES]: ok(tree),
      "GET /api/v1/posts/123": ok({ ...postDetail, contentMarkdown: "발행본" }),
      "GET /api/v1/posts/123/draft": ok({
        title: "고친 제목",
        contentMarkdown: "고친 본문",
        categoryId: 13,
        tags: ["jpa"],
        topicId: 11,
        savedAt: "2026-10-06T05:00:00Z",
      }),
      [TOPICS]: ok(topics),
      "GET /api/v1/posts/123/trackback-pings": ok([ping]),
    });

    const result = await callLoader("/marco/write/123", { handle: "marco", postId: "123" });

    expect(result).toEqual({
      handle: "marco",
      post: {
        id: 123,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        commentEnabled: true,
        thumbnailUrl: postDetail.thumbnailUrl,
        notice: false,
        scheduledAt: null,
      },
      draft: {
        title: "고친 제목",
        contentMarkdown: "고친 본문",
        categoryId: 13,
        tags: ["jpa"],
        topicId: 11,
        savedAt: "2026-10-06T05:00:00Z",
      },
      latestDraft: null,
      categories: tree,
      topics,
      defaultTopicId: null,
      pings: [ping],
    });
  });

  it("글 수정: 사본에 카테고리·태그가 없으면 미분류·빈 목록", async () => {
    mockBackend({
      [ME]: ok(me),
      [CATEGORIES]: ok([]),
      "GET /api/v1/posts/123": ok(postDetail),
      "GET /api/v1/posts/123/draft": ok({ title: "t", contentMarkdown: "c", savedAt: null }),
    });

    await expect(
      callLoader("/marco/write/123", { handle: "marco", postId: "123" }),
    ).resolves.toMatchObject({ draft: { categoryId: null, tags: [], topicId: null } });
  });

  it("글 수정: :handle 블로그의 글이 아니면 404", async () => {
    mockBackend({
      [ME]: ok(me),
      [CATEGORIES]: ok([]),
      "GET /api/v1/posts/123": ok({ ...postDetail, blogHandle: "marco-dev" }),
      "GET /api/v1/posts/123/draft": ok({ title: "", contentMarkdown: "", savedAt: null }),
    });

    expect(
      statusOf(await caught(callLoader("/marco/write/123", { handle: "marco", postId: "123" }))),
    ).toBe(404);
  });

  it.each([
    ["숫자가 아닌 글 번호", "abc", null],
    ["없는 글", "999", fail(404, "POST_NOT_FOUND")],
    ["남의 글", "999", fail(403, "FORBIDDEN")],
  ])("글 수정: %s는 404", async (_name, postId, response) => {
    mockBackend({
      [ME]: ok(me),
      ...(response
        ? { "GET /api/v1/posts/999": response, "GET /api/v1/posts/999/draft": response }
        : {}),
    });

    expect(
      statusOf(await caught(callLoader(`/marco/write/${postId}`, { handle: "marco", postId }))),
    ).toBe(404);
  });
});

describe("write meta", () => {
  it("noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("ko") }] } as unknown as MetaArgs;
    expect(meta(args)).toEqual([
      { title: "글쓰기 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("write 화면", () => {
  const newPost: LoaderData = {
    handle: "marco",
    post: null,
    draft: null,
    latestDraft: null,
    categories: tree,
    topics,
    defaultTopicId: null,
  };
  const savedDraft = (
    title: string,
    contentMarkdown: string,
    savedAt = "2026-10-06T04:24:19Z",
  ) => ({
    title,
    contentMarkdown,
    categoryId: null,
    tags: [],
    topicId: null,
    savedAt,
  });

  function renderWrite(data: LoaderData = newPost, entry = "/marco/write") {
    return renderRoutes(
      [
        { path: ":handle/write/:postId?", loader: () => data, Component: Write },
        { path: ":handle/:postId", Component: () => <p>post page</p> },
      ],
      { initialEntries: [entry] },
    );
  }

  async function type(title: string, body: string) {
    fireEvent.change(await screen.findByLabelText("제목"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText("본문"), { target: { value: body } });
  }

  function savingBackend(extra: Record<string, BackendHandler | Response> = {}) {
    let saved = 0;
    return mockBackend({
      [CREATE_DRAFT]: () => ok({ id: 77, savedAt: "2026-10-06T04:24:19Z" }, { status: 201 }),
      "PUT /api/v1/posts/77/draft": () => {
        saved += 1;
        return ok({ id: 77, savedAt: `2026-10-06T04:2${5 + saved}:00Z` });
      },
      ...extra,
    });
  }

  it('"완료"는 API를 부르지 않고 발행 설정 레이어를 열고, 닫으면 작성 화면으로 돌아온다', async () => {
    const backend = savingBackend();
    renderWrite();
    await type("제목", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));

    const dialog = await screen.findByRole("dialog", { name: "발행 설정" });
    expect(backend.calls).toHaveLength(0);
    expect(within(dialog).getByRole("radio", { name: "공개" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "이 글에 댓글 허용" })).toBeChecked();
    expect(dialog).toHaveTextContent("지금");

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("제목")).toHaveValue("제목");
    expect(backend.calls).toHaveLength(0);
  });

  it('버튼 이름은 공개 범위에 따라 "공개 발행"/"비공개 저장"', async () => {
    mockBackend();
    renderWrite();
    fireEvent.click(await screen.findByRole("button", { name: "완료" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "공개 발행" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "비공개(나만 보기)" }));
    expect(within(dialog).getByRole("button", { name: "비공개 저장" })).toBeInTheDocument();
  });

  it('발행된 글이면 "수정 발행", 저장된 공개 범위·댓글 설정으로 연다', async () => {
    mockBackend();
    renderWrite(
      {
        handle: "marco",
        post: {
          id: 123,
          status: "PUBLISHED",
          visibility: "PRIVATE",
          commentEnabled: false,
          thumbnailUrl: null,
          notice: false,
          scheduledAt: null,
        },
        draft: savedDraft("제목", "본문"),
        latestDraft: null,
        categories: tree,
        topics,
        defaultTopicId: null,
        pings: [],
      },
      "/marco/write/123",
    );

    fireEvent.click(await screen.findByRole("button", { name: "완료" }));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "수정 발행" })).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: "비공개(나만 보기)" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "이 글에 댓글 허용" })).not.toBeChecked();
    expect(screen.getByLabelText("제목")).toHaveValue("제목");
  });

  it("발행: 작성 내용을 임시저장한 뒤 발행 설정으로 발행하고 글 상세로 이동한다", async () => {
    const backend = savingBackend({
      "POST /api/v1/posts/77/publish": ok({ ...postDetail, id: 77 }),
    });
    renderWrite();
    await type("새 글", "# 안녕");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "이 글에 댓글 허용" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "공개 발행" }));

    expect(await screen.findByText("post page")).toBeInTheDocument();
    expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      CREATE_DRAFT,
      "POST /api/v1/posts/77/publish",
    ]);
    expect(backend.calls[0].body).toEqual({
      title: "새 글",
      contentMarkdown: "# 안녕",
      categoryId: null,
      tags: [],
      topicId: null,
    });
    expect(backend.calls[1].body).toEqual({
      visibility: "PUBLIC",
      commentEnabled: false,
      categoryId: null,
      tags: [],
      topicId: null,
      thumbnailMediaKey: null,
      notice: false,
      scheduledAt: null,
    });
  });

  it("보호·예약 발행: 비밀번호와 UTC 예약 시각을 보내고 예약 글 목록으로 이동한다(004)", async () => {
    const backend = savingBackend({
      "POST /api/v1/posts/77/publish": ok({ ...postDetail, id: 77, status: "SCHEDULED" }),
    });
    renderRoutes(
      [
        { path: ":handle/write/:postId?", loader: () => newPost, Component: Write },
        { path: ":handle/manage/posts", Component: () => <p>scheduled list</p> },
      ],
      { initialEntries: ["/marco/write"] },
    );
    await type("예약 글", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText("보호(비밀번호를 아는 사람만)"));
    fireEvent.change(within(dialog).getByLabelText("보호 글 비밀번호"), {
      target: { value: "open-sesame" },
    });
    fireEvent.click(within(dialog).getByLabelText("예약 발행"));
    fireEvent.change(within(dialog).getByLabelText("발행할 날짜와 시각"), {
      target: { value: "2026-10-08T09:00" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "예약 발행" }));

    expect(await screen.findByText("scheduled list")).toBeInTheDocument();
    expect(backend.calls[1].body).toMatchObject({
      visibility: "PROTECTED",
      password: "open-sesame",
      scheduledAt: "2026-10-08T00:00:00Z",
    });
  });

  it("발행 직전에 에디터의 지금 내용을 읽어 저장한다(입력 알림이 아직 오지 않았어도)", async () => {
    const backend = savingBackend({
      "POST /api/v1/posts/77/publish": ok({ ...postDetail, id: 77 }),
    });
    renderWrite();
    fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "빠르게 쓴 글" } });
    editor.unreported = "방금 친 본문";

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "공개 발행" }));

    expect(await screen.findByText("post page")).toBeInTheDocument();
    expect(backend.calls[0].body).toMatchObject({
      title: "빠르게 쓴 글",
      contentMarkdown: "방금 친 본문",
    });
  });

  it('"임시저장" 버튼도 에디터의 지금 내용을 저장한다', async () => {
    const backend = savingBackend();
    renderWrite();
    fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "제목" } });
    editor.unreported = "늦게 알린 본문";

    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));

    await vi.waitFor(() => expect(backend.calls).toHaveLength(1));
    expect(backend.calls[0].body).toEqual({
      title: "제목",
      contentMarkdown: "늦게 알린 본문",
      categoryId: null,
      tags: [],
      topicId: null,
    });
  });

  it("발행 오류(POST_CONTENT_EMPTY, 제목 REQUIRED)는 발행 설정 안에 보여준다", async () => {
    savingBackend({
      "POST /api/v1/posts/77/publish": fail(422, "POST_CONTENT_EMPTY"),
    });
    renderWrite();
    await type("제목만", "");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "본문을 입력해야 발행할 수 있습니다.",
    );
  });

  it("발행 검증 오류의 필드 문구", async () => {
    savingBackend({
      "POST /api/v1/posts/77/publish": fail(400, "VALIDATION_FAILED", [
        { field: "title", code: "REQUIRED" },
      ]),
    });
    renderWrite();
    await type("", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "제목: 필수 입력 항목입니다.",
    );
  });

  it("트랙백 보내기(005): 입력한 주소를 trackbackUrls로 함께 보낸다", async () => {
    const backend = savingBackend({
      "POST /api/v1/posts/77/publish": ok({ ...postDetail, id: 77 }),
    });
    renderWrite();
    await type("새 글", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.change(screen.getByLabelText("트랙백 보내기"), {
      target: { value: "https://other.example/1/trackback" },
    });
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(await screen.findByText("post page")).toBeInTheDocument();
    expect(backend.callsTo("POST /api/v1/posts/77/publish")[0].body).toMatchObject({
      trackbackUrls: ["https://other.example/1/trackback"],
    });
  });

  it.each([
    [
      fail(400, "VALIDATION_FAILED", [
        { field: "trackbackUrls[0]", code: "INVALID" },
        { field: "trackbackUrls", code: "TOO_LONG", params: { max: 10 } },
      ]),
      "트랙백 보내기: 올바르지 않은 값입니다. 트랙백 보내기: 트랙백은 한 번에 10개까지 보낼 수 있습니다.",
    ],
    [fail(422, "TRACKBACK_NOT_ALLOWED"), "공개 글에서만 트랙백을 보낼 수 있습니다."],
  ])("트랙백 주소 오류 문구(005) %#", async (response, message) => {
    savingBackend({ "POST /api/v1/posts/77/publish": response });
    renderWrite();
    await type("새 글", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.change(screen.getByLabelText("트랙백 보내기"), {
      target: { value: "nope" },
    });
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(message);
  });

  it("이미 있는 글의 발행 설정에 보낸 트랙백 결과(성공·실패 이유·보내는 중)", async () => {
    mockBackend();
    renderWrite(
      {
        handle: "marco",
        post: {
          id: 123,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          commentEnabled: true,
          thumbnailUrl: null,
          notice: false,
          scheduledAt: null,
        },
        draft: savedDraft("제목", "본문"),
        latestDraft: null,
        categories: tree,
        topics,
        defaultTopicId: null,
        pings: [
          ping,
          {
            ...ping,
            id: 2,
            targetUrl: "https://down.example/tb",
            status: "FAILED",
            errorCode: "REMOTE_ERROR",
            errorMessage: "Duplicate trackback",
          },
          {
            ...ping,
            id: 3,
            targetUrl: "https://slow.example/tb",
            status: "PENDING",
            attemptedAt: null,
          },
        ],
      },
      "/marco/write/123",
    );

    fireEvent.click(await screen.findByRole("button", { name: "완료" }));
    const results = within(screen.getByRole("dialog")).getByRole("list", { name: "보낸 트랙백" });
    const items = within(results).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("https://other.example/tb/1 성공");
    expect(items[1]).toHaveTextContent("실패 상대 블로그가 받지 않았습니다. (Duplicate trackback)");
    expect(items[2]).toHaveTextContent("보내는 중");
  });

  it('"임시저장" 버튼: 처음에는 이 블로그에 새 임시저장 글을 만들고, 다음부터는 그 글에 저장한다', async () => {
    const backend = savingBackend();
    renderWrite();
    await type("제목", "본문");

    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    expect(await screen.findByText(/에 저장했습니다\./)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("본문"), { target: { value: "본문 2" } });
    expect(screen.getByText("저장하지 않은 변경이 있습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    await vi.waitFor(() => expect(backend.calls).toHaveLength(2));

    expect(backend.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      CREATE_DRAFT,
      "PUT /api/v1/posts/77/draft",
    ]);
    expect(backend.calls[1].body).toMatchObject({ title: "제목", contentMarkdown: "본문 2" });
  });

  it("발행 설정에서 고른 카테고리·태그를 사본에 저장하고 발행 요청에 담는다", async () => {
    const backend = savingBackend({
      "POST /api/v1/posts/77/publish": ok({ ...postDetail, id: 77 }),
    });
    renderWrite();
    await type("분류한 글", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    const dialog = screen.getByRole("dialog");
    const select = within(dialog).getByRole("combobox", { name: "카테고리" });
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["미분류", "Spring", "— JPA", "일상"]);
    fireEvent.change(select, { target: { value: "13" } });
    const topicSelect = within(dialog).getByRole("combobox", { name: "주제" });
    expect(topicSelect).toHaveValue("");
    fireEvent.change(topicSelect, { target: { value: "11" } });
    const tagInput = within(dialog).getByRole("textbox", { name: "태그" });
    fireEvent.change(tagInput, { target: { value: "  Spring Boot " } });
    fireEvent.keyDown(tagInput, { key: "Enter" });
    expect(within(dialog).getByText("#spring boot")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "공개 발행" }));

    expect(await screen.findByText("post page")).toBeInTheDocument();
    expect(backend.calls[0].body).toEqual({
      title: "분류한 글",
      contentMarkdown: "본문",
      categoryId: 13,
      tags: ["spring boot"],
      topicId: 11,
    });
    expect(backend.calls[1].body).toEqual({
      visibility: "PUBLIC",
      commentEnabled: true,
      categoryId: 13,
      tags: ["spring boot"],
      topicId: 11,
      thumbnailMediaKey: null,
      notice: false,
      scheduledAt: null,
    });
  });

  it("사본의 카테고리·태그로 열고, 바꾼 뒤 닫으면 저장하지 않은 변경으로 남아 임시저장된다", async () => {
    const backend = mockBackend({
      "PUT /api/v1/posts/123/draft": ok({ id: 123, savedAt: "2026-10-06T05:10:00Z" }),
    });
    renderWrite(
      {
        handle: "marco",
        post: {
          id: 123,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          commentEnabled: true,
          thumbnailUrl: null,
          notice: false,
          scheduledAt: null,
        },
        draft: { ...savedDraft("제목", "본문"), categoryId: 20, tags: ["daily", "life"] },
        latestDraft: null,
        categories: tree,
        topics,
        defaultTopicId: null,
        pings: [],
      },
      "/marco/write/123",
    );

    fireEvent.click(await screen.findByRole("button", { name: "완료" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "카테고리" })).toHaveValue("20");
    expect(within(dialog).getByText("#daily")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "daily 태그 빼기" }));
    fireEvent.change(within(dialog).getByRole("combobox", { name: "카테고리" }), {
      target: { value: "" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    expect(screen.getByText("저장하지 않은 변경이 있습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    await vi.waitFor(() => expect(backend.calls).toHaveLength(1));
    expect(backend.calls[0].body).toEqual({
      title: "제목",
      contentMarkdown: "본문",
      categoryId: null,
      tags: ["life"],
      topicId: null,
    });

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("combobox", { name: "카테고리" }),
    ).toHaveValue("");
  });

  it("새 글은 블로그 기본 주제를 미리 골라 사본과 발행 요청에 담는다", async () => {
    const backend = savingBackend({
      "POST /api/v1/posts/77/publish": ok({ ...postDetail, id: 77 }),
    });
    renderWrite({ ...newPost, defaultTopicId: 11 });
    await type("기본 주제", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "주제" })).toHaveValue("11");
    fireEvent.click(within(dialog).getByRole("button", { name: "공개 발행" }));

    expect(await screen.findByText("post page")).toBeInTheDocument();
    expect(backend.calls[0].body).toMatchObject({ topicId: 11 });
    expect(backend.calls[1].body).toMatchObject({ topicId: 11 });
  });

  it("주제 발행 오류(TOPIC_NOT_SELECTABLE)는 발행 설정 안에 알린다", async () => {
    savingBackend({ "POST /api/v1/posts/77/publish": fail(422, "TOPIC_NOT_SELECTABLE") });
    renderWrite();
    await type("제목", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "고를 수 없는 주제입니다.",
    );
  });

  it("태그·카테고리 발행 오류 문구", async () => {
    savingBackend({
      "POST /api/v1/posts/77/publish": fail(400, "VALIDATION_FAILED", [
        { field: "tags[0]", code: "TOO_LONG", params: { max: 30 } },
      ]),
    });
    renderWrite();
    await type("제목", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "태그: 30자 이하로 입력해 주세요.",
    );
  });

  it("다른 블로그 카테고리(CATEGORY_NOT_FOUND)는 발행 설정 안에 알린다", async () => {
    savingBackend({ "POST /api/v1/posts/77/publish": fail(404, "CATEGORY_NOT_FOUND") });
    renderWrite();
    await type("제목", "본문");

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(
      "카테고리를 찾을 수 없습니다.",
    );
  });

  it("1분마다 바뀐 내용이 있을 때만 자동저장한다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const backend = savingBackend();
    renderWrite();

    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS));
    expect(backend.calls).toHaveLength(0);

    await type("자동", "저장");
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS));
    expect(backend.calls.map((call) => call.path)).toEqual(["/api/v1/blogs/marco/posts/drafts"]);

    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS));
    expect(backend.calls).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("본문"), { target: { value: "저장 2" } });
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_INTERVAL_MS));
    expect(backend.calls.map((call) => call.path)).toEqual([
      "/api/v1/blogs/marco/posts/drafts",
      "/api/v1/posts/77/draft",
    ]);
    expect(AUTOSAVE_INTERVAL_MS).toBe(60_000);
  });

  it("저장 실패는 화면에 알리고 내용은 그대로 둔다", async () => {
    mockBackend({ [CREATE_DRAFT]: fail(500, "INTERNAL_ERROR") });
    renderWrite();
    await type("제목", "본문");

    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("서버에 문제가 생겼습니다.");
    expect(screen.getByLabelText("제목")).toHaveValue("제목");
  });

  it("열 때 drafts/latest가 있으면 이어 쓸지 묻고, 이어 쓰기는 그 글의 수정 화면으로", async () => {
    mockBackend();
    renderRoutes(
      [
        {
          path: ":handle/write/:postId?",
          loader: ({ params }): LoaderData =>
            params.postId
              ? {
                  handle: "marco",
                  post: {
                    id: 55,
                    status: "DRAFT",
                    visibility: "PUBLIC",
                    commentEnabled: true,
                    thumbnailUrl: null,
                    notice: false,
                    scheduledAt: null,
                  },
                  draft: savedDraft("쓰던 글", "쓰던 본문"),
                  latestDraft: null,
                  categories: tree,
                  topics,
                  defaultTopicId: null,
                  pings: [],
                }
              : {
                  ...newPost,
                  latestDraft: { id: 55, title: "쓰던 글", savedAt: "2026-10-06T04:24:19Z" },
                },
          Component: Write,
        },
      ],
      { initialEntries: ["/marco/write"] },
    );

    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent("작성 중이던 글 「쓰던 글」");
    expect(screen.getByLabelText("제목")).toHaveValue("");
    fireEvent.click(within(prompt).getByRole("link", { name: "이어 쓰기" }));

    await vi.waitFor(() => expect(screen.getByLabelText("제목")).toHaveValue("쓰던 글"));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("본문")).toHaveValue("쓰던 본문");
  });

  it("새 글 쓰기를 고르면 묻는 창을 닫는다", async () => {
    mockBackend();
    renderWrite({
      ...newPost,
      latestDraft: { id: 55, title: "", savedAt: "2026-10-06T04:24:19Z" },
    });

    const prompt = await screen.findByRole("alertdialog");
    expect(prompt).toHaveTextContent("「제목 없음」");
    expect(within(prompt).getByRole("link", { name: "이어 쓰기" })).toHaveAttribute(
      "href",
      "/marco/write/55",
    );
    fireEvent.click(within(prompt).getByRole("button", { name: "새 글 쓰기" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("write 예약 취소(004 T085)", () => {
  type ActionArgs = Parameters<typeof action>[0];
  const UNSCHEDULE = "POST /api/v1/posts/55/unschedule";
  const callAction = (fields: Record<string, string>, handle = "marco", postId = "55") =>
    action(
      routeArgs<ActionArgs>(formRequest(`/${handle}/write/${postId}`, fields, loggedIn), {
        handle,
        postId,
      }),
    );

  it("intent=unschedule은 POST /posts/{id}/unschedule 뒤 같은 작성 화면으로", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [UNSCHEDULE]: ok({ id: 55, status: "DRAFT", scheduledAt: null }),
    });
    expect(expectRedirect(await caught(callAction({ intent: "unschedule" })))).toBe(
      "/marco/write/55",
    );
    expect(backend.callsTo(UNSCHEDULE)).toHaveLength(1);
  });

  it("예약 글이 아니면(409) 오류를 돌려주고, 내 블로그가 아니거나 모르는 작업이면 거부", async () => {
    mockBackend({ [ME]: ok(me), [UNSCHEDULE]: fail(409, "POST_NOT_SCHEDULED") });
    const conflict = asData<{ resultCode: string }>(await callAction({ intent: "unschedule" }));
    expect(conflict.data.resultCode).toBe("POST_NOT_SCHEDULED");
    expect(conflict.init?.status).toBe(409);

    mockBackend({ [ME]: ok(me), [UNSCHEDULE]: fail(403, "FORBIDDEN") });
    expect(statusOf(await caught(callAction({ intent: "unschedule" })))).toBe(404);
    expect(statusOf(await caught(callAction({ intent: "unschedule" }, "someone")))).toBe(404);
    const unknown = asData<{ resultCode: string }>(await callAction({ intent: "publish" }));
    expect(unknown.init?.status).toBe(400);
  });

  it("예약 글을 열면 예약 시각 안내와 예약 취소, 발행 설정에 예약 시각이 채워져 있다", async () => {
    mockBackend();
    renderRoutes(
      [
        {
          path: ":handle/write/:postId?",
          loader: () => ({
            handle: "marco",
            post: {
              id: 55,
              status: "SCHEDULED",
              visibility: "PROTECTED",
              commentEnabled: true,
              thumbnailUrl: null,
              notice: false,
              scheduledAt: "2026-10-08T00:00:00Z",
            },
            draft: {
              title: "예약 글",
              contentMarkdown: "본문",
              categoryId: null,
              tags: [],
              topicId: null,
              savedAt: "2026-10-07T00:00:00Z",
            },
            latestDraft: null,
            categories: [],
            topics: [],
            defaultTopicId: null,
          }),
          Component: Write,
        },
      ],
      { initialEntries: ["/marco/write/55"] },
    );

    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("에 발행하도록 예약된 글입니다.");
    expect(within(note).getByRole("button", { name: "예약 취소" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(screen.getByLabelText("예약 발행")).toBeChecked();
    expect(screen.getByLabelText("발행할 날짜와 시각")).toHaveValue("2026-10-08T09:00");
    expect(screen.getByText("바꾸지 않으려면 비워 두세요.")).toBeInTheDocument();
  });
});
