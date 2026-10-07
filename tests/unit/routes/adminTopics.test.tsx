// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Topics, { action, loader, reorderedIds } from "~/routes/admin/topics";

import { ME, adminTopic, loggedIn, member, stub } from "../support/admin";
import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type Args = Parameters<typeof action>[0];
const TOPICS = "GET /api/v1/admin/topics";
const tree = [
  adminTopic(1, "dev", { pinnedOnTab: true, recentPostCount: 12 }, [
    adminTopic(11, "java", { parentId: 1, recentPostCount: 1 }),
    adminTopic(12, "web", { parentId: 1, adminHidden: true, effectiveHidden: true }),
    adminTopic(13, "go", { parentId: 1 }),
  ]),
  adminTopic(2, "life", { adminHidden: true, effectiveHidden: true, onTab: false }, [
    adminTopic(21, "travel", { parentId: 2, effectiveHidden: true, onTab: false }),
  ]),
  adminTopic(3, "misc", { onTab: false }),
];

const submit = (fields: Record<string, string>) =>
  action(routeArgs<Args>(formRequest("/admin/topics", fields, loggedIn)));

/** 주제 관리(003 T090) */
describe("주제 관리 loader·action", () => {
  it("loader는 관리자 트리를 읽는다", async () => {
    mockBackend({ [ME]: ok(member()), [TOPICS]: ok(tree) });

    await expect(
      loader(routeArgs<Parameters<typeof loader>[0]>(getRequest("/admin/topics", loggedIn))),
    ).resolves.toEqual({ topics: tree });
  });

  it("추가: slug·4개 언어 이름·색, 부모(없으면 대분류)를 보낸다", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "POST /api/v1/admin/topics": ok(adminTopic(14, "rust"), { status: 201 }),
    });

    const result = asData(
      await submit({
        intent: "create",
        parentId: "1",
        slug: " rust ",
        "names.ko": "러스트",
        "names.en": "Rust",
        "names.ja": "ラスト",
        "names.zh-CN": "锈",
        cardColor: "#112233",
      }),
    );
    await submit({
      intent: "create",
      parentId: "",
      slug: "hobby",
      "names.ko": "취미",
      "names.en": "Hobby",
      "names.ja": "趣味",
      "names.zh-CN": "爱好",
      cardColor: "",
    });

    expect(result.data).toEqual({ intent: "create", ok: true });
    const bodies = backend.callsTo("POST /api/v1/admin/topics").map((call) => call.body);
    expect(bodies).toEqual([
      {
        parentId: 1,
        slug: "rust",
        names: { ko: "러스트", en: "Rust", ja: "ラスト", "zh-CN": "锈" },
        cardColor: "#112233",
      },
      {
        parentId: null,
        slug: "hobby",
        names: { ko: "취미", en: "Hobby", ja: "趣味", "zh-CN": "爱好" },
        cardColor: null,
      },
    ]);
  });

  it("추가: slug·이름이 비면 backend를 부르지 않고 REQUIRED", async () => {
    const backend = mockBackend({ [ME]: ok(member()) });

    const result = asData(await submit({ intent: "create", "names.ko": "가" }));

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({
      ok: false,
      fieldErrors: [
        { field: "slug", code: "REQUIRED" },
        { field: "names.en", code: "REQUIRED" },
        { field: "names.ja", code: "REQUIRED" },
        { field: "names.zh-CN", code: "REQUIRED" },
      ],
    });
    expect(backend.calls.map((call) => call.path)).toEqual(["/api/v1/me"]);
  });

  it("수정·숨김·해제·고정·해제는 PATCH /admin/topics/{id}", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "PATCH /api/v1/admin/topics/11": ok(adminTopic(11, "java")),
    });

    await submit({
      intent: "update",
      id: "11",
      "names.ko": "자바",
      "names.en": "Java",
      "names.ja": "ジャバ",
      "names.zh-CN": "爪哇",
      cardColor: "",
    });
    for (const intent of ["hide", "unhide", "pin", "unpin"]) {
      expect(asData(await submit({ intent, id: "11" })).data).toEqual({ intent, ok: true });
    }

    expect(backend.callsTo("PATCH /api/v1/admin/topics/11").map((call) => call.body)).toEqual([
      { names: { ko: "자바", en: "Java", ja: "ジャバ", "zh-CN": "爪哇" }, cardColor: null },
      { adminHidden: true },
      { adminHidden: false },
      { pinnedOnTab: true },
      { pinnedOnTab: false },
    ]);
  });

  it("위·아래는 지금 트리를 읽어 그 부모의 전체 순서를 PUT /admin/topics/order로", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [TOPICS]: ok(tree),
      "PUT /api/v1/admin/topics/order": ok(null),
    });

    await submit({ intent: "down", id: "11" });
    await submit({ intent: "up", id: "3" });
    await submit({ intent: "up", id: "1" });

    expect(backend.callsTo("PUT /api/v1/admin/topics/order").map((call) => call.body)).toEqual([
      { parentId: 1, ids: [12, 11, 13] },
      { parentId: null, ids: [1, 3, 2] },
    ]);
  });

  it("reorderedIds: 끝에서 더 옮길 수 없거나 없는 주제면 null", () => {
    expect(reorderedIds(tree, 13, "down")).toBeNull();
    expect(reorderedIds(tree, 1, "up")).toBeNull();
    expect(reorderedIds(tree, 99, "up")).toBeNull();
    expect(reorderedIds(tree, 21, "up")).toBeNull();
    expect(reorderedIds(tree, 12, "up")).toEqual({ parentId: 1, ids: [12, 11, 13] });
  });

  it("오류: TOPIC_SLUG_TAKEN·TOPIC_DEPTH_EXCEEDED·필드 오류는 폼 오류로, 모르는 intent·번호는 400", async () => {
    mockBackend({
      [ME]: ok(member()),
      "POST /api/v1/admin/topics": fail(409, "TOPIC_SLUG_TAKEN"),
      "PATCH /api/v1/admin/topics/11": fail(400, "VALIDATION_FAILED", [
        { field: "cardColor", code: "INVALID_FORMAT" },
      ]),
    });
    const names = { "names.ko": "a", "names.en": "a", "names.ja": "a", "names.zh-CN": "a" };

    const taken = asData(await submit({ intent: "create", slug: "dev", ...names }));
    expect(taken.init?.status).toBe(409);
    expect(taken.data).toMatchObject({ ok: false, resultCode: "TOPIC_SLUG_TAKEN" });

    const color = asData(await submit({ intent: "update", id: "11", ...names, cardColor: "red" }));
    expect(color.data).toMatchObject({ fieldErrors: [{ field: "cardColor" }] });

    expect(asData(await submit({ intent: "nope" })).init?.status).toBe(400);
    expect(asData(await submit({ intent: "hide", id: "x" })).init?.status).toBe(400);
  });

  it("action에서도 권한 회수(404 NOT_FOUND)는 404 화면", async () => {
    mockBackend({
      [ME]: ok(member()),
      "PATCH /api/v1/admin/topics/11": fail(404, "NOT_FOUND"),
    });

    expect(statusOf(await caught(submit({ intent: "hide", id: "11" })))).toBe(404);
  });

  it("관리자가 아니면 action도 404", async () => {
    mockBackend({ [ME]: ok(member("USER")) });

    expect(statusOf(await caught(submit({ intent: "hide", id: "11" })))).toBe(404);
  });
});

describe("주제 관리 화면", () => {
  function renderTopics(routes: Record<string, BackendHandler | Response> = {}) {
    const backend = mockBackend({ [ME]: ok(member()), [TOPICS]: ok(tree), ...routes });
    renderRoutes(
      [{ path: "admin/topics", loader: stub(loader), action: stub(action), Component: Topics }],
      { initialEntries: ["/admin/topics"] },
    );
    return backend;
  }

  it("트리: 숨김·대분류 숨김으로 숨김·탭 고정·탭에서 빠짐·최근 30일 글 수", async () => {
    renderTopics();

    const dev = await screen.findByRole("region", { name: "dev 한" });
    expect(dev).toHaveTextContent("탭 고정");
    expect(dev).toHaveTextContent("최근 30일 글 12편");
    expect(within(dev).getByRole("button", { name: "탭 고정 해제" })).toBeInTheDocument();
    expect(within(dev).getByRole("button", { name: "dev 한 위로" })).toBeDisabled();

    const web = screen.getByRole("region", { name: "web 한" });
    expect(web).toHaveTextContent("숨김");
    expect(within(web).getByRole("button", { name: "숨김 해제" })).toBeInTheDocument();
    expect(within(web).queryByRole("button", { name: "탭 고정" })).toBeNull();

    expect(screen.getByRole("region", { name: "travel 한" })).toHaveTextContent(
      "대분류가 숨겨져 함께 숨김",
    );
    expect(screen.getByRole("region", { name: "misc 한" })).toHaveTextContent(
      "글이 적어 탭에서 자동으로 빠짐",
    );
    expect(
      within(screen.getByRole("region", { name: "go 한" })).getByRole("button", {
        name: "go 한 아래로",
      }),
    ).toBeDisabled();
  });

  it("추가 폼으로 소분류를 만들면 안내", async () => {
    const backend = renderTopics({
      "POST /api/v1/admin/topics": ok(adminTopic(14, "rust"), { status: 201 }),
    });

    const form = (await screen.findByRole("group", { name: "주제 추가" })) as HTMLElement;
    fireEvent.change(within(form).getByLabelText("위치"), { target: { value: "1" } });
    fireEvent.change(within(form).getByLabelText("주소(slug)"), { target: { value: "rust" } });
    for (const [label, value] of [
      ["이름(한국어)", "러스트"],
      ["이름(English)", "Rust"],
      ["이름(日本語)", "ラスト"],
      ["이름(简体中文)", "锈"],
    ]) {
      fireEvent.change(within(form).getByLabelText(label), { target: { value } });
    }
    fireEvent.click(within(form).getByRole("button", { name: "추가" }));

    expect(await screen.findByRole("status")).toHaveTextContent("주제를 추가했습니다.");
    expect(backend.callsTo("POST /api/v1/admin/topics")[0].body).toMatchObject({
      parentId: 1,
      slug: "rust",
    });
  });

  it("오류 문구: 코드 문구와 입력란별 문구", async () => {
    renderTopics({
      "POST /api/v1/admin/topics": fail(422, "TOPIC_DEPTH_EXCEEDED"),
      "PATCH /api/v1/admin/topics/11": fail(400, "VALIDATION_FAILED", [
        { field: "names.ja", code: "TOO_LONG", params: { max: 50 } },
      ]),
    });

    const java = await screen.findByRole("region", { name: "java 한" });
    fireEvent.click(within(java).getByRole("button", { name: "이름·색 저장" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("입력한 내용을 확인해 주세요.");
    expect(alert).toHaveTextContent("이름(日本語): 50자 이하로 입력해 주세요.");

    const form = screen.getByRole("group", { name: "주제 추가" }) as HTMLElement;
    fireEvent.change(within(form).getByLabelText("주소(slug)"), { target: { value: "deep" } });
    for (const label of ["이름(한국어)", "이름(English)", "이름(日本語)", "이름(简体中文)"]) {
      fireEvent.change(within(form).getByLabelText(label), { target: { value: "x" } });
    }
    fireEvent.click(within(form).getByRole("button", { name: "추가" }));
    expect(
      await screen.findByText("소분류 아래에는 주제를 더 만들 수 없습니다."),
    ).toBeInTheDocument();
  });

  it("주제가 없으면 안내", async () => {
    renderTopics({ [TOPICS]: ok([]) });

    expect(await screen.findByText("아직 주제가 없습니다.")).toBeInTheDocument();
  });
});
