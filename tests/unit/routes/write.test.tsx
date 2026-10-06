// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import Write, { AUTOSAVE_INTERVAL_MS, loader, meta } from "~/routes/write";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { postDetail } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { caught, expectRedirect, getRequest, routeArgs, statusOf } from "../support/route";

// 에디터(Milkdown Crepe)는 브라우저 전용이라 이 테스트에서는 같은 인터페이스의 입력란으로 바꾼다.
vi.mock("~/components/Editor/Editor", () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (markdown: string) => void }) => (
    <textarea aria-label="본문" defaultValue={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

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
const CREATE_DRAFT = "POST /api/v1/blogs/marco/posts/drafts";
const loggedIn = { cookie: "access_token=a" };

afterEach(() => {
  vi.useRealTimers();
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
    mockBackend({ [ME]: ok(me), [LATEST]: ok(latest) });
    const request = getRequest("/marco/write", loggedIn);

    const result = await loader(routeArgs<LoaderArgs>(request, { handle: "marco" }));

    expect(result).toEqual({ handle: "marco", post: null, draft: null, latestDraft: latest });
    expect(responseCookies(request)).toEqual([
      expect.stringMatching(/^last_blog=marco; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax/),
    ]);
  });

  it("새 글: 임시저장이 없으면(null) 묻지 않는다", async () => {
    mockBackend({ [ME]: ok(me), [LATEST]: ok(null) });

    await expect(callLoader("/marco/write", { handle: "marco" })).resolves.toMatchObject({
      latestDraft: null,
    });
  });

  it("글 수정: 작성 중 사본과 글 상태를 불러온다", async () => {
    mockBackend({
      [ME]: ok(me),
      "GET /api/v1/posts/123": ok({ ...postDetail, contentMarkdown: "발행본" }),
      "GET /api/v1/posts/123/draft": ok({
        title: "고친 제목",
        contentMarkdown: "고친 본문",
        categoryId: null,
        tags: [],
        savedAt: "2026-10-06T05:00:00Z",
      }),
    });

    const result = await callLoader("/marco/write/123", { handle: "marco", postId: "123" });

    expect(result).toEqual({
      handle: "marco",
      post: { id: 123, status: "PUBLISHED", visibility: "PUBLIC", commentEnabled: true },
      draft: { title: "고친 제목", contentMarkdown: "고친 본문", savedAt: "2026-10-06T05:00:00Z" },
      latestDraft: null,
    });
  });

  it("글 수정: :handle 블로그의 글이 아니면 404", async () => {
    mockBackend({
      [ME]: ok(me),
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
  const newPost: LoaderData = { handle: "marco", post: null, draft: null, latestDraft: null };

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
        post: { id: 123, status: "PUBLISHED", visibility: "PRIVATE", commentEnabled: false },
        draft: { title: "제목", contentMarkdown: "본문", savedAt: "2026-10-06T04:24:19Z" },
        latestDraft: null,
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
    expect(backend.calls[0].body).toEqual({ title: "새 글", contentMarkdown: "# 안녕" });
    expect(backend.calls[1].body).toEqual({ visibility: "PUBLIC", commentEnabled: false });
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
    expect(backend.calls[1].body).toEqual({ title: "제목", contentMarkdown: "본문 2" });
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
                  post: { id: 55, status: "DRAFT", visibility: "PUBLIC", commentEnabled: true },
                  draft: {
                    title: "쓰던 글",
                    contentMarkdown: "쓰던 본문",
                    savedAt: "2026-10-06T04:24:19Z",
                  },
                  latestDraft: null,
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
