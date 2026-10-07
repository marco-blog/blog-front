// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GuestbookEntry } from "~/api/models";
import BlogGuestbook, { action, loader, meta } from "~/routes/blog-guestbook";

import { fail, mockBackend, ok } from "../support/backend";
import { blog } from "../support/fixtures";
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

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type MetaArgs = Parameters<typeof meta>[0];
type LoaderData = Awaited<ReturnType<typeof loader>>;

const BLOG = "GET /api/v1/blogs/marco";
const LIST = "GET /api/v1/blogs/marco/guestbook";
const WRITE = "POST /api/v1/blogs/marco/guestbook";

export function entry(id: number, overrides: Partial<GuestbookEntry> = {}): GuestbookEntry {
  return {
    id,
    content: `방명록 ${id}`,
    secret: false,
    deleted: false,
    author: { userId: 42, nickname: "리더", profileImageUrl: null, guest: false },
    createdAt: "2026-10-06T04:24:19Z",
    updatedAt: "2026-10-06T04:24:19Z",
    replies: [],
    ...overrides,
  };
}

const callLoader = (path: string) =>
  loader(routeArgs<LoaderArgs>(getRequest(path), { handle: path.split(/[/?]/)[1] }));

const callAction = (fields: Record<string, string>, path = "/marco/guestbook") =>
  action(
    routeArgs<ActionArgs>(formRequest(path, fields, { cookie: "access_token=a" }), {
      handle: "marco",
    }),
  );

describe("방명록 loader", () => {
  it("/blogs/{h}와 /blogs/{h}/guestbook?page=(0부터)를 부른다", async () => {
    const entries = [entry(2), entry(1)];
    const backend = mockBackend({
      [BLOG]: ok({ ...blog, guestWriteEnabled: true }),
      [LIST]: ok(entries, { totalCount: 22 }),
    });

    const result = await callLoader("/marco/guestbook?page=2");

    expect(result).toEqual({
      blog: {
        handle: "marco",
        title: blog.title,
        description: blog.description,
        guestWriteEnabled: true,
      },
      entries,
      totalCount: 22,
      page: 2,
      pageSize: 20,
      origin: "http://front.test",
    });
    expect(backend.callsTo(LIST)[0].url.searchParams.get("page")).toBe("1");
  });

  it("꺼진 방명록(404 GUESTBOOK_DISABLED)·없는 블로그는 404", async () => {
    mockBackend({ [BLOG]: ok(blog), [LIST]: fail(404, "GUESTBOOK_DISABLED") });
    expect(statusOf(await caught(callLoader("/marco/guestbook")))).toBe(404);
  });

  it("주소 규칙에 맞지 않으면 backend를 부르지 않고 404", async () => {
    const backend = mockBackend();
    const thrown = await caught(
      loader(routeArgs<LoaderArgs>(getRequest("/Bad/guestbook"), { handle: "Bad" })),
    );
    expect(statusOf(thrown)).toBe(404);
    const actionThrown = await caught(
      action(
        routeArgs<ActionArgs>(formRequest("/Bad/guestbook", { intent: "create" }), {
          handle: "Bad",
        }),
      ),
    );
    expect(statusOf(actionThrown)).toBe(404);
    expect(backend.calls).toHaveLength(0);
  });
});

describe("방명록 action", () => {
  it("create: 회원은 내용·비밀글만 보내고 첫 쪽으로 리다이렉트", async () => {
    const backend = mockBackend({ [WRITE]: ok(entry(3), { status: 201 }) });

    const location = expectRedirect(
      await caught(
        callAction(
          { intent: "create", target: "new", content: "놀러 왔어요", secret: "on" },
          "/marco/guestbook?page=3",
        ),
      ),
    );

    expect(location).toBe("/marco/guestbook");
    expect(backend.callsTo(WRITE)[0].body).toEqual({ content: "놀러 왔어요", secret: true });
  });

  it("create: 비회원은 이름·비밀번호를 함께 보낸다", async () => {
    const backend = mockBackend({ [WRITE]: ok(entry(3), { status: 201 }) });

    await caught(
      callAction({
        intent: "create",
        content: "안녕하세요",
        guestName: " 지나가던 사람 ",
        guestPassword: "1234",
      }),
    );

    expect(backend.callsTo(WRITE)[0].body).toEqual({
      content: "안녕하세요",
      secret: false,
      guestName: "지나가던 사람",
      guestPassword: "1234",
    });
  });

  it("create: 빈 내용·비회원 이름·짧은 비밀번호는 backend를 부르지 않고 필드 오류", async () => {
    const backend = mockBackend();

    const result = asData(
      await callAction({ intent: "create", content: " ", guestName: "", guestPassword: "12" }),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({
      intent: "create",
      target: "new",
      ok: false,
      resultCode: "VALIDATION_FAILED",
      fieldErrors: [
        { field: "content", code: "REQUIRED" },
        { field: "guestName", code: "REQUIRED" },
        { field: "guestPassword", code: "TOO_SHORT", params: { min: 4 } },
      ],
    });
    expect(backend.calls).toHaveLength(0);
  });

  it("create: 너무 긴 내용·이름·비밀번호", async () => {
    mockBackend();
    const result = asData(
      await callAction({
        intent: "create",
        content: "가".repeat(1001),
        guestName: "a".repeat(31),
        guestPassword: "p".repeat(65),
      }),
    );
    expect((result.data as { fieldErrors: unknown[] }).fieldErrors).toEqual([
      { field: "content", code: "TOO_LONG", params: { max: 1000 } },
      { field: "guestName", code: "TOO_LONG", params: { max: 30 } },
      { field: "guestPassword", code: "TOO_LONG", params: { max: 64 } },
    ]);
  });

  it("reply: parentId와 내용을 보내고 같은 쪽으로", async () => {
    const backend = mockBackend({ [WRITE]: ok(entry(4), { status: 201 }) });

    const location = expectRedirect(
      await caught(
        callAction(
          { intent: "reply", target: "reply-1", parentId: "1", content: "반가워요" },
          "/marco/guestbook?page=2",
        ),
      ),
    );

    expect(location).toBe("/marco/guestbook?page=2");
    expect(backend.callsTo(WRITE)[0].body).toEqual({ content: "반가워요", parentId: 1 });
  });

  it("update: 회원은 PATCH 내용·비밀글, 비회원은 비밀번호도", async () => {
    const backend = mockBackend({ "PATCH /api/v1/guestbook-entries/7": ok(entry(7)) });

    await caught(callAction({ intent: "update", entryId: "7", content: "고침" }));
    await caught(
      callAction({
        intent: "update",
        entryId: "7",
        content: "고침",
        secret: "on",
        guestPassword: "1234",
      }),
    );

    const bodies = backend.callsTo("PATCH /api/v1/guestbook-entries/7").map((call) => call.body);
    expect(bodies).toEqual([
      { content: "고침", secret: false },
      { content: "고침", secret: true, guestPassword: "1234" },
    ]);
  });

  it("delete: 회원·주인은 본문 없이, 비회원은 { guestPassword }", async () => {
    const backend = mockBackend({ "DELETE /api/v1/guestbook-entries/7": ok(null) });

    expectRedirect(await caught(callAction({ intent: "delete", entryId: "7" })));
    expectRedirect(
      await caught(callAction({ intent: "delete", entryId: "7", guestPassword: "1234" })),
    );

    const calls = backend.callsTo("DELETE /api/v1/guestbook-entries/7");
    expect(calls[0].body).toBeUndefined();
    expect(calls[1].body).toEqual({ guestPassword: "1234" });
  });

  it("delete: 비회원 비밀번호 칸이 비면 REQUIRED", async () => {
    mockBackend();
    const result = asData(
      await callAction({ intent: "delete", target: "delete-7", entryId: "7", guestPassword: "" }),
    );
    expect(result.data).toMatchObject({
      target: "delete-7",
      fieldErrors: [{ field: "guestPassword", code: "REQUIRED" }],
    });
  });

  it("unlock: 비밀번호로 내용을 받아 돌려준다", async () => {
    const opened = entry(7, { secret: true, content: "비밀 내용" });
    const backend = mockBackend({ "POST /api/v1/guestbook-entries/7/unlock": ok(opened) });

    const result = asData(
      await callAction({
        intent: "unlock",
        target: "unlock-7",
        entryId: "7",
        guestPassword: "1234",
      }),
    );

    expect(result.data).toEqual({ intent: "unlock", target: "unlock-7", ok: true, entry: opened });
    expect(backend.callsTo("POST /api/v1/guestbook-entries/7/unlock")[0].body).toEqual({
      guestPassword: "1234",
    });
  });

  it("틀린 비밀번호(GUEST_PASSWORD_MISMATCH)는 비밀번호 칸 오류, 막히면 Retry-After", async () => {
    let blocked = false;
    mockBackend({
      "POST /api/v1/guestbook-entries/7/unlock": () =>
        blocked
          ? fail(429, "PASSWORD_ATTEMPTS_EXCEEDED", [], { "retry-after": "300" })
          : fail(403, "GUEST_PASSWORD_MISMATCH"),
    });

    const mismatch = asData(
      await callAction({
        intent: "unlock",
        target: "unlock-7",
        entryId: "7",
        guestPassword: "9999",
      }),
    );
    blocked = true;
    const exceeded = asData(
      await callAction({
        intent: "unlock",
        target: "unlock-7",
        entryId: "7",
        guestPassword: "9999",
      }),
    );

    expect(mismatch.init?.status).toBe(403);
    expect(mismatch.data).toMatchObject({
      resultCode: "GUEST_PASSWORD_MISMATCH",
      field: "guestPassword",
    });
    expect(exceeded.init?.status).toBe(429);
    expect(exceeded.data).toMatchObject({
      resultCode: "PASSWORD_ATTEMPTS_EXCEEDED",
      retryAfter: 300,
    });
  });

  it("너무 빠른 쓰기(TOO_MANY_REQUESTS)는 오류 코드", async () => {
    mockBackend({ [WRITE]: fail(429, "TOO_MANY_REQUESTS", [], { "retry-after": "40" }) });
    const result = asData(await callAction({ intent: "create", content: "또" }));
    expect(result.data).toMatchObject({ ok: false, resultCode: "TOO_MANY_REQUESTS" });
  });

  it("차단된 회원(403 FORBIDDEN)은 차단 사실을 드러내지 않는 일반 오류(004 FR-146)", async () => {
    mockBackend({ [WRITE]: fail(403, "FORBIDDEN") });
    const result = asData(await callAction({ intent: "create", content: "또" }));
    expect(result.init?.status).toBe(403);
    expect(result.data).toMatchObject({ ok: false, resultCode: "FORBIDDEN" });
    expect(JSON.stringify(result.data)).not.toMatch(/block/i);
  });

  it("로그인이 풀렸으면(401) 방명록으로 돌아오는 로그인 화면으로", async () => {
    mockBackend({ [WRITE]: fail(401, "UNAUTHENTICATED") });
    const location = expectRedirect(await caught(callAction({ intent: "create", content: "글" })));
    expect(location).toBe("/login?next=%2Fmarco%2Fguestbook");
  });

  it("모르는 작업·잘못된 번호는 backend를 부르지 않고 400", async () => {
    const backend = mockBackend();
    expect(asData(await callAction({ intent: "hack" })).init?.status).toBe(400);
    expect(
      asData(await callAction({ intent: "update", entryId: "x", content: "a" })).init?.status,
    ).toBe(400);
    expect(
      asData(await callAction({ intent: "reply", parentId: "", content: "a" })).init?.status,
    ).toBe(400);
    expect(
      asData(await callAction({ intent: "unlock", entryId: "7", guestPassword: "" })).init?.status,
    ).toBe(400);
    expect(backend.calls).toHaveLength(0);
  });
});

describe("방명록 meta", () => {
  const metaArgs = (data: LoaderData | undefined) =>
    ({
      data,
      loaderData: data,
      params: { handle: "marco" },
      matches: [{ id: "root", loaderData: rootData("ko") }],
    }) as unknown as MetaArgs;
  const data = (page: number): LoaderData => ({
    blog: { handle: "marco", title: blog.title, description: null, guestWriteEnabled: false },
    entries: [],
    totalCount: 0,
    page,
    pageSize: 20,
    origin: "https://blog.java21.net",
  });

  it("{방명록} - {블로그 제목}, 2쪽 이상 noindex", () => {
    expect(meta(metaArgs(data(1)))).toEqual(
      expect.arrayContaining([
        { title: "방명록 - 마르코의 블로그" },
        { tagName: "link", rel: "canonical", href: "https://blog.java21.net/marco/guestbook" },
      ]),
    );
    expect(meta(metaArgs(data(1)))).not.toContainEqual({ name: "robots", content: "noindex" });
    expect(meta(metaArgs(data(2)))).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("오류면 찾을 수 없음", () => {
    expect(meta(metaArgs(undefined))[0]).toEqual({ title: "페이지를 찾을 수 없습니다 - 블로그" });
  });
});

describe("방명록 화면", () => {
  function renderGuestbook(
    data: Partial<LoaderData>,
    user: { userId: number; nickname: string; role: string; blogs?: string[] } | null = null,
    actionHandler?: () => unknown,
  ) {
    const loaderData: LoaderData = {
      blog: { handle: "marco", title: blog.title, description: null, guestWriteEnabled: false },
      entries: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      origin: "http://front.test",
      ...data,
    };
    renderRoutes(
      [
        {
          path: ":handle/guestbook",
          loader: () => loaderData,
          action: actionHandler,
          Component: BlogGuestbook,
        },
      ],
      { initialEntries: ["/marco/guestbook"], user },
    );
  }

  it("비로그인 + 비회원 허용이면 이름·비밀번호 칸", async () => {
    renderGuestbook({
      blog: { handle: "marco", title: blog.title, description: null, guestWriteEnabled: true },
    });

    const form = await screen.findByRole("form", { name: "방명록 쓰기" });
    expect(within(form).getByLabelText("이름")).toBeInTheDocument();
    expect(within(form).getByLabelText("비밀번호")).toHaveAttribute("type", "password");
    expect(within(form).getByLabelText("비밀글 (블로그 주인과 나만 보기)")).not.toBeChecked();
    expect(screen.getByText("아직 방명록에 남긴 글이 없습니다.")).toBeInTheDocument();
  });

  it("비로그인 + 비회원 허용 안 함이면 로그인 안내 링크", async () => {
    renderGuestbook({});

    expect(
      await screen.findByRole("link", { name: "방명록을 쓰려면 로그인하세요" }),
    ).toHaveAttribute("href", "/login?next=%2Fmarco%2Fguestbook");
    expect(screen.queryByRole("form", { name: "방명록 쓰기" })).toBeNull();
  });

  it("로그인 회원은 내용·비밀글만, 글 목록과 페이지 이동", async () => {
    renderGuestbook(
      { entries: [entry(2), entry(1)], totalCount: 25 },
      { userId: 9, nickname: "손님", role: "USER", blogs: ["guest9"] },
    );

    const form = await screen.findByRole("form", { name: "방명록 쓰기" });
    expect(within(form).queryByLabelText("이름")).toBeNull();
    expect(screen.getByRole("list", { name: "방명록 글 목록" })).toHaveTextContent("방명록 2");
    expect(screen.getByRole("navigation", { name: "페이지" })).toBeInTheDocument();
  });

  it("오류 문구: 너무 빠른 쓰기·비밀번호 시도 제한(남은 분)", async () => {
    let response: unknown = {
      intent: "create",
      target: "new",
      ok: false,
      resultCode: "TOO_MANY_REQUESTS",
      field: null,
      fieldErrors: [],
    };
    renderGuestbook({}, { userId: 9, nickname: "손님", role: "USER" }, () => response);

    const form = await screen.findByRole("form", { name: "방명록 쓰기" });
    fireEvent.change(within(form).getByLabelText("방명록 내용"), { target: { value: "글" } });
    fireEvent.click(within(form).getByRole("button", { name: "남기기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    );

    response = {
      ...(response as object),
      resultCode: "PASSWORD_ATTEMPTS_EXCEEDED",
      retryAfter: 120,
    };
    fireEvent.click(within(form).getByRole("button", { name: "남기기" }));
    expect(
      await screen.findByText("비밀번호를 여러 번 틀렸습니다. 2분 뒤에 다시 시도해 주세요."),
    ).toBeInTheDocument();
  });

  it("필드 오류는 입력란 아래에", async () => {
    renderGuestbook(
      {
        blog: { handle: "marco", title: blog.title, description: null, guestWriteEnabled: true },
      },
      null,
      () => ({
        intent: "create",
        target: "new",
        ok: false,
        resultCode: "VALIDATION_FAILED",
        field: null,
        fieldErrors: [{ field: "guestName", code: "REQUIRED" }],
      }),
    );

    const form = await screen.findByRole("form", { name: "방명록 쓰기" });
    fireEvent.change(within(form).getByLabelText("방명록 내용"), { target: { value: "글" } });
    fireEvent.change(within(form).getByLabelText("이름"), { target: { value: "이름" } });
    fireEvent.change(within(form).getByLabelText("비밀번호"), { target: { value: "1234" } });
    fireEvent.click(within(form).getByRole("button", { name: "남기기" }));
    expect(await screen.findByText("필수 입력 항목입니다.")).toBeInTheDocument();
    expect(within(form).getByLabelText("이름")).toHaveAttribute("aria-invalid", "true");
  });
});
