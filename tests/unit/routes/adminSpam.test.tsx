// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BannedWord, Setting } from "~/api/models";
import AdminSpam, { action, loader, meta, spamHref } from "~/routes/admin/spam";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type Args = Parameters<typeof action>[0];
const SETTINGS = "GET /api/v1/admin/settings";
const WORDS = "GET /api/v1/admin/banned-words";

const setting = (
  key: string,
  value: unknown,
  defaultValue: unknown,
  overridden = false,
): Setting => ({
  key,
  value,
  defaultValue,
  overridden,
  updatedBy: overridden ? ({ userId: 1, nickname: "운영자" } as Setting["updatedBy"]) : null,
  updatedAt: overridden ? "2026-10-05T00:00:00Z" : null,
});
const rateLimits = [
  setting("ratelimit.post-publish-per-hour", 10, 10),
  setting("ratelimit.comment-per-minute", 3, 5, true),
  setting("ratelimit.guestbook-per-minute", 5, 5),
  setting("ratelimit.media-upload-per-minute", 30, 30),
  setting("ratelimit.signup-per-ip-per-hour", 5, 5),
];
const spam = [
  setting(
    "spam.duplicate-comment",
    { windowMinutes: 10, maxCount: 3 },
    {
      windowMinutes: 10,
      maxCount: 3,
    },
  ),
];
const word = (id: number, text: string, overrides: Partial<BannedWord> = {}): BannedWord => ({
  id,
  word: text,
  scope: "CONTENT",
  action: "MASK",
  createdBy: { id: 1, nickname: "운영자" },
  createdAt: "2026-10-05T00:00:00Z",
  updatedAt: "2026-10-05T00:00:00Z",
  ...overrides,
});
const words = [word(1, "광고"), word(2, "운영자", { scope: "NAME", action: "REJECT" })];

const settingsHandler: BackendHandler = (call) =>
  ok(call.url.searchParams.get("prefix") === "spam." ? spam : rateLimits);

const post = (fields: Record<string, string>) =>
  action(routeArgs<Args>(formRequest("/admin/spam", fields, loggedIn)));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("스팸 방어 설정 loader·action(005 T072)", () => {
  it("loader: 한도·반복 기준 설정 두 묶음과 금칙어 목록(검색어·0부터 쪽)", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [SETTINGS]: settingsHandler,
      [WORDS]: ok(words, { totalCount: 42 }),
    });

    const result = await loader(
      routeArgs<Parameters<typeof loader>[0]>(
        getRequest("/admin/spam?q=%20광고%20&page=2", loggedIn),
      ),
    );

    expect(result).toEqual({
      settings: [...rateLimits, ...spam],
      words,
      totalCount: 42,
      q: "광고",
      page: 2,
    });
    expect(backend.callsTo(SETTINGS).map((call) => call.url.searchParams.get("prefix"))).toEqual([
      "ratelimit.",
      "spam.",
    ]);
    const list = backend.callsTo(WORDS)[0].url.searchParams;
    expect([list.get("q"), list.get("page"), list.get("size")]).toEqual(["광고", "1", "20"]);
  });

  it("loader: 관리자가 아니면 404", async () => {
    mockBackend({ [ME]: ok(member("USER")) });
    expect(
      statusOf(
        await caught(
          loader(routeArgs<Parameters<typeof loader>[0]>(getRequest("/admin/spam", loggedIn))),
        ),
      ),
    ).toBe(404);
  });

  it("설정 저장: 한도는 정수, 반복 기준은 두 값 객체. 기본값으로는 DELETE", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "PUT /api/v1/admin/settings/ratelimit.comment-per-minute": ok(rateLimits[1]),
      "PUT /api/v1/admin/settings/spam.duplicate-comment": ok(spam[0]),
      "DELETE /api/v1/admin/settings/ratelimit.comment-per-minute": ok(rateLimits[1]),
    });

    expect(
      asData(await post({ intent: "setting", key: "ratelimit.comment-per-minute", value: "7" }))
        .data,
    ).toEqual({ intent: "setting", ok: true, key: "ratelimit.comment-per-minute" });
    await post({
      intent: "setting",
      key: "spam.duplicate-comment",
      "duplicate.windowMinutes": "15",
      "duplicate.maxCount": "4",
    });
    expect(
      asData(await post({ intent: "resetSetting", key: "ratelimit.comment-per-minute" })).data,
    ).toEqual({ intent: "resetSetting", ok: true, key: "ratelimit.comment-per-minute" });

    expect(
      backend.callsTo("PUT /api/v1/admin/settings/ratelimit.comment-per-minute")[0].body,
    ).toEqual({ value: 7 });
    expect(backend.callsTo("PUT /api/v1/admin/settings/spam.duplicate-comment")[0].body).toEqual({
      value: { windowMinutes: 15, maxCount: 4 },
    });
    expect(
      backend.callsTo("DELETE /api/v1/admin/settings/ratelimit.comment-per-minute"),
    ).toHaveLength(1);
  });

  it("빈 값·정수 아님·모르는 키·모르는 intent는 backend를 부르지 않는다", async () => {
    const backend = mockBackend({ [ME]: ok(member()) });

    expect(
      asData(await post({ intent: "setting", key: "ratelimit.comment-per-minute", value: "" }))
        .data,
    ).toMatchObject({ fieldErrors: [{ field: "value", code: "REQUIRED" }] });
    expect(
      asData(
        await post({
          intent: "setting",
          key: "spam.duplicate-comment",
          "duplicate.windowMinutes": "1.5",
          "duplicate.maxCount": "",
        }),
      ).data,
    ).toMatchObject({
      fieldErrors: [
        { field: "duplicate.windowMinutes", code: "INVALID" },
        { field: "duplicate.maxCount", code: "REQUIRED" },
      ],
    });
    expect(
      asData(await post({ intent: "setting", key: "portal.min-content-length", value: "1" })).init
        ?.status,
    ).toBe(400);
    expect(asData(await post({ intent: "nope" })).init?.status).toBe(400);
    expect(asData(await post({ intent: "updateWord", id: "x" })).init?.status).toBe(400);
    expect(
      asData(await post({ intent: "addWord", word: " ", scope: "EVERY", action: "HIDE" })).data,
    ).toMatchObject({
      fieldErrors: [
        { field: "word", code: "REQUIRED" },
        { field: "scope", code: "INVALID" },
        { field: "action", code: "INVALID" },
      ],
    });
    expect(backend.calls.every((call) => call.path === "/api/v1/me")).toBe(true);
  });

  it("범위 오류(value.maxCount)는 화면 입력란 이름(duplicate.maxCount)으로", async () => {
    mockBackend({
      [ME]: ok(member()),
      "PUT /api/v1/admin/settings/spam.duplicate-comment": fail(400, "VALIDATION_FAILED", [
        { field: "value.maxCount", code: "INVALID", params: { min: 2, max: 100 } },
      ]),
    });

    expect(
      asData(
        await post({
          intent: "setting",
          key: "spam.duplicate-comment",
          "duplicate.windowMinutes": "10",
          "duplicate.maxCount": "1",
        }),
      ).data,
    ).toMatchObject({
      ok: false,
      key: "spam.duplicate-comment",
      fieldErrors: [{ field: "duplicate.maxCount", code: "INVALID" }],
    });
  });

  it("금칙어 추가·변경·삭제와 backend 오류(중복 409, 없음 404)", async () => {
    let created = false;
    const backend = mockBackend({
      [ME]: ok(member()),
      "POST /api/v1/admin/banned-words": () =>
        created
          ? fail(409, "BANNED_WORD_EXISTS")
          : ((created = true), ok(word(3, "도박"), { status: 201 })),
      "PATCH /api/v1/admin/banned-words/1": ok(word(1, "광고", { action: "REJECT" })),
      "DELETE /api/v1/admin/banned-words/1": ok(null),
      "DELETE /api/v1/admin/banned-words/9": fail(404, "BANNED_WORD_NOT_FOUND"),
    });

    expect(
      asData(await post({ intent: "addWord", word: " 도박 ", scope: "ALL", action: "REJECT" }))
        .data,
    ).toEqual({ intent: "addWord", ok: true });
    expect(backend.callsTo("POST /api/v1/admin/banned-words")[0].body).toEqual({
      word: "도박",
      scope: "ALL",
      action: "REJECT",
    });
    expect(
      asData(await post({ intent: "addWord", word: "도박", scope: "ALL", action: "REJECT" })).data,
    ).toMatchObject({ ok: false, resultCode: "BANNED_WORD_EXISTS" });

    expect(
      asData(await post({ intent: "updateWord", id: "1", scope: "CONTENT", action: "REJECT" }))
        .data,
    ).toEqual({ intent: "updateWord", ok: true, wordId: 1 });
    expect(backend.callsTo("PATCH /api/v1/admin/banned-words/1")[0].body).toEqual({
      scope: "CONTENT",
      action: "REJECT",
    });
    expect(
      asData(await post({ intent: "updateWord", id: "1", scope: "NAME", action: "X" })).data,
    ).toMatchObject({ ok: false, wordId: 1, fieldErrors: [{ field: "action", code: "INVALID" }] });

    expect(asData(await post({ intent: "deleteWord", id: "1" })).data).toEqual({
      intent: "deleteWord",
      ok: true,
      wordId: 1,
    });
    expect(asData(await post({ intent: "deleteWord", id: "9" })).data).toMatchObject({
      ok: false,
      wordId: 9,
      resultCode: "BANNED_WORD_NOT_FOUND",
    });
  });

  it("주소 만들기와 noindex", () => {
    expect(spamHref("")).toBe("/admin/spam");
    expect(spamHref("광고", 2)).toBe("/admin/spam?q=%EA%B4%91%EA%B3%A0&page=2");
    expect(meta(metaArgs())).toEqual([
      { title: "스팸 방어 설정 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("스팸 방어 설정 화면", () => {
  function renderSpam(
    routes: Record<string, BackendHandler | Response> = {},
    entry = "/admin/spam",
  ) {
    const backend = mockBackend({
      [ME]: ok(member()),
      [SETTINGS]: settingsHandler,
      [WORDS]: ok(words, { totalCount: 2 }),
      ...routes,
    });
    renderRoutes(
      [{ path: "admin/spam", loader: stub(loader), action: stub(action), Component: AdminSpam }],
      { initialEntries: [entry] },
    );
    return backend;
  }

  it("한도 5개와 반복 기준: 지금 값·기본값·바꾼 관리자, 바뀐 것만 기본값으로", async () => {
    renderSpam();

    const comment = await screen.findByRole("region", { name: "댓글(1분)" });
    expect(within(comment).getByLabelText(/한도/)).toHaveValue(3);
    expect(comment).toHaveTextContent("기본값: 5");
    expect(comment).toHaveTextContent("운영자 님이");
    expect(within(comment).getByRole("button", { name: "기본값으로" })).toBeInTheDocument();

    for (const name of [
      "글 발행(1시간)",
      "방명록(1분)",
      "이미지 업로드(1분)",
      "가입(IP당 1시간)",
    ]) {
      const region = screen.getByRole("region", { name });
      expect(region).toHaveTextContent("기본값을 쓰고 있습니다.");
      expect(within(region).queryByRole("button", { name: "기본값으로" })).toBeNull();
    }
    const duplicate = screen.getByRole("region", { name: "같은 내용 반복" });
    expect(within(duplicate).getByLabelText(/기준 시간/)).toHaveValue(10);
    expect(within(duplicate).getByLabelText(/허용 횟수/)).toHaveValue(3);
  });

  it("댓글 한도를 저장하고 기본값으로 되돌리면 그 영역에 안내", async () => {
    const backend = renderSpam({
      "PUT /api/v1/admin/settings/ratelimit.comment-per-minute": ok(rateLimits[1]),
      "DELETE /api/v1/admin/settings/ratelimit.comment-per-minute": ok(rateLimits[1]),
    });

    const comment = await screen.findByRole("region", { name: "댓글(1분)" });
    fireEvent.change(within(comment).getByLabelText(/한도/), { target: { value: "8" } });
    fireEvent.click(within(comment).getByRole("button", { name: "저장" }));
    expect(await within(comment).findByRole("status")).toHaveTextContent("설정을 저장했습니다.");
    expect(
      backend.callsTo("PUT /api/v1/admin/settings/ratelimit.comment-per-minute")[0].body,
    ).toEqual({ value: 8 });

    fireEvent.click(within(comment).getByRole("button", { name: "기본값으로" }));
    expect(await within(comment).findByText("기본값으로 되돌렸습니다.")).toBeInTheDocument();
  });

  it("범위 오류 문구는 그 설정 영역에", async () => {
    renderSpam({
      "PUT /api/v1/admin/settings/spam.duplicate-comment": fail(400, "VALIDATION_FAILED", [
        { field: "value.maxCount", code: "INVALID" },
      ]),
    });

    const duplicate = await screen.findByRole("region", { name: "같은 내용 반복" });
    fireEvent.click(within(duplicate).getByRole("button", { name: "저장" }));
    expect(await within(duplicate).findByRole("alert")).toHaveTextContent(
      "허용 횟수: 올바르지 않은 값입니다.",
    );
  });

  it("금칙어 목록: 단어·범위·처리 방식·등록자, 이름류면 가림을 고를 수 없다", async () => {
    renderSpam();

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("광고");
    expect(within(rows[1]).getByLabelText("처리 방식")).toHaveValue("MASK");
    expect(within(rows[2]).getByLabelText("적용 범위")).toHaveValue("NAME");
    expect(
      within(within(rows[2]).getByLabelText("처리 방식")).getByRole("option", { name: "가림" }),
    ).toBeDisabled();
    expect(screen.getByText("금칙어 2개")).toBeInTheDocument();

    // 추가 폼: 범위를 이름류로 바꾸면 가림이 꺼지고 거부로
    const add = screen.getByRole("heading", { name: "금칙어 추가" }).closest("form")!;
    fireEvent.change(within(add).getByLabelText("적용 범위"), { target: { value: "NAME" } });
    expect(within(add).getByLabelText("처리 방식")).toHaveValue("REJECT");
    expect(
      within(within(add).getByLabelText("처리 방식")).getByRole("option", { name: "가림" }),
    ).toBeDisabled();
  });

  it("추가·변경·삭제(확인)와 오류 문구", async () => {
    const backend = renderSpam({
      "POST /api/v1/admin/banned-words": fail(409, "BANNED_WORD_EXISTS"),
      "PATCH /api/v1/admin/banned-words/1": ok(word(1, "광고", { action: "REJECT" })),
      "DELETE /api/v1/admin/banned-words/1": ok(null),
    });

    const add = (await screen.findByRole("heading", { name: "금칙어 추가" })).closest("form")!;
    fireEvent.change(within(add).getByLabelText("금칙어"), { target: { value: "광고" } });
    fireEvent.click(within(add).getByRole("button", { name: "추가" }));
    expect(await within(add).findByRole("alert")).toHaveTextContent("이미 등록된 금칙어입니다.");

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    fireEvent.change(within(rows[1]).getByLabelText("처리 방식"), { target: { value: "REJECT" } });
    fireEvent.click(within(rows[1]).getByRole("button", { name: "변경" }));
    expect(await screen.findByText("금칙어를 변경했습니다.")).toBeInTheDocument();
    expect(backend.callsTo("PATCH /api/v1/admin/banned-words/1")[0].body).toEqual({
      scope: "CONTENT",
      action: "REJECT",
    });

    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const remove = within(screen.getAllByRole("row")[1]).getByRole("button", {
      name: "금칙어 삭제: 광고",
    });
    fireEvent.click(remove);
    expect(backend.callsTo("DELETE /api/v1/admin/banned-words/1")).toHaveLength(0);
    fireEvent.click(remove);
    expect(await screen.findByText("금칙어를 삭제했습니다.")).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledWith('금칙어 "광고"을(를) 삭제할까요?');
    expect(backend.callsTo("DELETE /api/v1/admin/banned-words/1")).toHaveLength(1);
  });

  it("검색 결과가 없으면 안내, 빈 목록이면 등록 안내", async () => {
    renderSpam({ [WORDS]: ok([], { totalCount: 0 }) }, "/admin/spam?q=zzz");
    expect(await screen.findByText("검색 결과가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "금칙어 검색" })).toHaveValue("zzz");
  });
});
