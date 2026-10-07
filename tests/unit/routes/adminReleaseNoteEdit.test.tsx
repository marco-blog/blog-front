// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { emptyValues, readValues, valuesFrom, writeBody } from "~/admin/releaseNoteForm";
import type { AdminReleaseNote, AdminRevision } from "~/api/models";
import Edit, { action, loader, meta } from "~/routes/admin/release-note-edit";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
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

const BASE = "/api/v1/admin/release-notes";
const user = { userId: 1, nickname: "운영자", profileImageUrl: null };

const note = (overrides: Partial<AdminReleaseNote> = {}): AdminReleaseNote => ({
  id: 5,
  version: "1.4.0",
  releaseDate: "2026-10-07",
  contents: {
    ko: { title: "새 기능", contentMarkdown: "## 바뀐 점" },
    en: { title: "New", contentMarkdown: "## Changes" },
  },
  status: "DRAFT",
  revisionNo: 3,
  firstPublishedAt: null,
  publishedAt: null,
  createdBy: user,
  updatedBy: { ...user, nickname: "도우미" },
  createdAt: "2026-10-06T00:00:00Z",
  updatedAt: "2026-10-07T00:00:00Z",
  ...overrides,
});

const revision: AdminRevision = {
  revisionNo: 1,
  editedBy: user,
  editedAt: "2026-10-05T00:00:00Z",
  status: "DRAFT",
  version: "1.4.0",
  releaseDate: "2026-10-05",
  contents: { ko: { title: "처음", contentMarkdown: "첫 원문" } },
};

const fields = (overrides: Record<string, string> = {}) => ({
  version: "1.4.0",
  releaseDate: "2026-10-07",
  "contents.ko.title": "새 기능",
  "contents.ko.contentMarkdown": "## 바뀐 점",
  "contents.en.title": "New",
  "contents.en.contentMarkdown": "## Changes",
  "contents.ja.title": "",
  "contents.ja.contentMarkdown": "",
  "contents.zh-CN.title": "",
  "contents.zh-CN.contentMarkdown": "",
  ...overrides,
});

type Args = Parameters<typeof action>[0];
const post = (path: string, form: Record<string, string>, params: Record<string, string> = {}) =>
  action(routeArgs<Args>(formRequest(path, form, loggedIn), params));
/** URLSearchParams 하나로 같은 이름 여러 값(include)을 보낸다. */
const postParams = (path: string, body: URLSearchParams, params: Record<string, string> = {}) =>
  action(
    routeArgs<Args>(
      new Request(`http://front.test${path}`, {
        method: "POST",
        body,
        headers: { origin: "http://front.test", ...loggedIn },
      }),
      params,
    ),
  );

/** 편집기 값(006 T057) */
describe("releaseNoteForm", () => {
  it("빈 값·저장값·수정본 값, 넣을 언어판", () => {
    expect(emptyValues().included).toEqual(["ko"]);
    expect(valuesFrom(note()).included).toEqual(["ko", "en"]);
    expect(valuesFrom(note()).contents.ja).toEqual({ title: "", contentMarkdown: "" });
    expect(valuesFrom({ version: null, releaseDate: null, contents: null })).toMatchObject({
      version: "",
      releaseDate: "",
      included: ["ko"],
    });
  });

  it("폼 → 값 → 요청 본문(체크한 언어판만, 빈 날짜는 null)", () => {
    const form = new FormData();
    Object.entries(fields({ releaseDate: "" })).forEach(([key, value]) => form.append(key, value));
    form.append("include", "ja");
    form.append("include", "xx");
    const values = readValues(form);
    expect(values.included).toEqual(["ko", "ja"]);
    expect(writeBody(values, 3)).toEqual({
      version: "1.4.0",
      releaseDate: null,
      contents: {
        ko: { title: "새 기능", contentMarkdown: "## 바뀐 점" },
        ja: { title: "", contentMarkdown: "" },
      },
      baseRevisionNo: 3,
    });
    expect(writeBody(values)).not.toHaveProperty("baseRevisionNo");
  });
});

describe("release note edit loader", () => {
  const run = (path: string, params: Record<string, string> = {}) =>
    loader(routeArgs(getRequest(path, loggedIn), params) as never);

  it("/new는 빈 편집기, /:id는 GET 값, ?fromRevision=은 그 수정본 값(기준 번호는 지금 번호)", async () => {
    mockBackend({
      [ME]: ok(member()),
      [`GET ${BASE}/5`]: ok(note()),
      [`GET ${BASE}/5/revisions/1`]: ok(revision),
    });
    await expect(run("/admin/release-notes/new")).resolves.toEqual({
      note: null,
      values: emptyValues(),
      fromRevision: null,
    });
    await expect(run("/admin/release-notes/5", { id: "5" })).resolves.toMatchObject({
      note: note(),
      values: { version: "1.4.0", included: ["ko", "en"] },
      fromRevision: null,
    });
    await expect(run("/admin/release-notes/5?fromRevision=1", { id: "5" })).resolves.toMatchObject({
      note: { revisionNo: 3 },
      values: { releaseDate: "2026-10-05", included: ["ko"], contents: { ko: { title: "처음" } } },
      fromRevision: 1,
    });
  });

  it("숫자가 아닌 번호·없는 노트·관리자 아님은 404", async () => {
    mockBackend({ [ME]: ok(member()), [`GET ${BASE}/9`]: fail(404, "RELEASE_NOTE_NOT_FOUND") });
    expect(statusOf(await caught(run("/admin/release-notes/x", { id: "x" })))).toBe(404);
    expect(statusOf(await caught(run("/admin/release-notes/9", { id: "9" })))).toBe(404);
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(run("/admin/release-notes/new")))).toBe(404);
  });

  it("meta: 새 노트·버전 제목, noindex", () => {
    expect(meta(metaArgs())).toEqual([
      { title: "새 릴리스 노트 - 블로그" },
      { name: "robots", content: "noindex" },
    ]);
    expect(meta({ ...(metaArgs() as object), loaderData: { note: note() } } as never)[0]).toEqual({
      title: "릴리스 노트 1.4.0 - 블로그",
    });
  });
});

describe("release note edit action", () => {
  it("미리보기: 그 언어판 본문으로 POST /preview, 입력은 그대로", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [`POST ${BASE}/preview`]: ok({ contentHtml: "<h2>Changes</h2>", toc: [] }),
    });
    const result = asData<{ values: { version: string } }>(
      await post("/admin/release-notes/new", { ...fields(), intent: "preview:en" }),
    );
    expect(result.data).toMatchObject({
      intent: "preview",
      ok: true,
      lang: "en",
      preview: { contentHtml: "<h2>Changes</h2>" },
    });
    expect(result.data.values.version).toBe("1.4.0");
    expect(backend.callsTo(`POST ${BASE}/preview`)[0].body).toEqual({
      contentMarkdown: "## Changes",
    });
    expect(
      asData(await post("/admin/release-notes/new", { ...fields(), intent: "preview:xx" })).init
        ?.status,
    ).toBe(400);
  });

  it("새 노트 저장: POST(체크한 언어판만) → 201이면 편집 화면으로", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [`POST ${BASE}`]: ok(note({ id: 8 }), { status: 201 }),
    });
    const body = new URLSearchParams({ ...fields(), intent: "save" });
    body.append("include", "en");
    expect(expectRedirect(await postParams("/admin/release-notes/new", body))).toBe(
      "/admin/release-notes/8",
    );
    expect(backend.callsTo(`POST ${BASE}`)[0].body).toEqual({
      version: "1.4.0",
      releaseDate: "2026-10-07",
      contents: {
        ko: { title: "새 기능", contentMarkdown: "## 바뀐 점" },
        en: { title: "New", contentMarkdown: "## Changes" },
      },
    });
  });

  it("수정 저장: PUT + baseRevisionNo, 409 충돌이면 입력 유지와 충돌 표시, 필드 오류", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [`PUT ${BASE}/5`]: ok(note({ revisionNo: 4 })),
    });
    expect(
      asData(
        await post(
          "/admin/release-notes/5",
          { ...fields(), baseRevisionNo: "3", intent: "save" },
          { id: "5" },
        ),
      ).data,
    ).toEqual({ intent: "save", ok: true });
    expect(backend.callsTo(`PUT ${BASE}/5`)[0].body).toMatchObject({
      baseRevisionNo: 3,
      contents: { ko: {} },
    });

    mockBackend({
      [ME]: ok(member()),
      [`PUT ${BASE}/5`]: fail(409, "RELEASE_NOTE_REVISION_CONFLICT"),
    });
    const conflict = asData<{ values: { version: string } }>(
      await post(
        "/admin/release-notes/5",
        { ...fields({ version: "1.4.1" }), baseRevisionNo: "3", intent: "save" },
        { id: "5" },
      ),
    );
    expect(conflict.init?.status).toBe(409);
    expect(conflict.data).toMatchObject({ ok: false, conflict: true });
    expect(conflict.data.values.version).toBe("1.4.1");

    mockBackend({
      [ME]: ok(member()),
      [`POST ${BASE}`]: fail(400, "VALIDATION_FAILED", [
        { field: "version", code: "INVALID_FORMAT" },
      ]),
    });
    expect(
      asData(
        await post("/admin/release-notes/new", { ...fields({ version: "v1" }), intent: "save" }),
      ).data,
    ).toMatchObject({
      ok: false,
      conflict: false,
      fieldErrors: [{ field: "version", code: "INVALID_FORMAT" }],
    });
  });

  it("게시·게시 중단은 확인 체크가 있어야, 삭제는 목록으로", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [`POST ${BASE}/5/publish`]: ok(note({ status: "PUBLISHED" })),
      [`POST ${BASE}/5/unpublish`]: ok(note()),
      [`DELETE ${BASE}/5`]: ok(null),
    });
    const run = (form: Record<string, string>) => post("/admin/release-notes/5", form, { id: "5" });
    const missing = asData<{ fieldErrors: unknown[] }>(await run({ intent: "publish" }));
    expect(missing.init?.status).toBe(400);
    expect(missing.data.fieldErrors).toEqual([{ field: "confirm", code: "REQUIRED" }]);
    expect(backend.callsTo(`POST ${BASE}/5/publish`)).toHaveLength(0);

    expect(asData(await run({ intent: "publish", confirm: "yes" })).data).toEqual({
      intent: "publish",
      ok: true,
    });
    expect(asData(await run({ intent: "unpublish", confirm: "yes" })).data).toEqual({
      intent: "unpublish",
      ok: true,
    });
    expect(expectRedirect(await run({ intent: "delete", confirm: "yes" }))).toBe(
      "/admin/release-notes",
    );
    expect(backend.callsTo(`DELETE ${BASE}/5`)).toHaveLength(1);

    mockBackend({
      [ME]: ok(member()),
      [`DELETE ${BASE}/5`]: fail(409, "RELEASE_NOTE_ONCE_PUBLISHED"),
    });
    expect(asData(await run({ intent: "delete", confirm: "yes" })).data).toMatchObject({
      resultCode: "RELEASE_NOTE_ONCE_PUBLISHED",
    });
    // 새 노트에는 게시가 없고, 모르는 intent는 400
    expect(
      asData(await post("/admin/release-notes/new", { intent: "publish", confirm: "yes" })).init
        ?.status,
    ).toBe(400);
    expect(asData(await run({ intent: "archive" })).init?.status).toBe(400);
  });

  it("관리자 권한이 회수되면 404", async () => {
    mockBackend({ [ME]: ok(member()), [`PUT ${BASE}/5`]: fail(404, "NOT_FOUND") });
    expect(
      statusOf(
        await caught(
          post(
            "/admin/release-notes/5",
            { ...fields(), baseRevisionNo: "3", intent: "save" },
            { id: "5" },
          ),
        ),
      ),
    ).toBe(404);
  });
});

describe("release note edit 화면", () => {
  function renderEdit(entry: string, routes: Record<string, Response> = {}) {
    mockBackend({ [ME]: ok(member()), ...routes });
    renderRoutes(
      [
        {
          path: "admin/release-notes/new",
          loader: stub(loader),
          action: stub(action),
          Component: Edit,
        },
        {
          path: "admin/release-notes/:id",
          loader: stub(loader),
          action: stub(action),
          Component: Edit,
        },
      ],
      { initialEntries: [entry] },
    );
  }

  it("새 노트: 언어 탭 4개(ko 필수, 나머지 넣기 체크), 초안 저장, 게시 영역 없음", async () => {
    renderEdit("/admin/release-notes/new");

    expect(
      await screen.findByRole("heading", { name: "새 릴리스 노트", level: 1 }),
    ).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "언어판" });
    expect(
      within(tabs)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["한국어", "#lang-ko"],
      ["English", "#lang-en"],
      ["日本語", "#lang-ja"],
      ["简体中文", "#lang-zh-CN"],
    ]);
    expect(screen.getByText("한국어 (필수)")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: /이 언어판 넣기/ })).toHaveLength(3);
    expect(screen.getByRole("textbox", { name: "버전" })).not.toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "초안 저장" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "게시" })).toBeNull();
    expect(document.getElementById("lang-ko")).toHaveAttribute("open");
    expect(document.getElementById("lang-ja")).not.toHaveAttribute("open");
    // JS가 있으면 탭을 누를 때 그 칸을 펼친다
    fireEvent.click(within(tabs).getByRole("link", { name: "日本語" }));
    expect(document.getElementById("lang-ja")).toHaveAttribute("open");
  });

  it("수정: 값 채움·숨은 기준 번호·정보·링크, 초안이면 게시와 삭제", async () => {
    renderEdit("/admin/release-notes/5", { [`GET ${BASE}/5`]: ok(note()) });

    expect(
      await screen.findByRole("heading", { name: "릴리스 노트 1.4.0", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "버전" })).toHaveValue("1.4.0");
    expect(screen.getByRole("textbox", { name: "제목 (English)" })).toHaveValue("New");
    expect(screen.getByRole("checkbox", { name: "이 언어판 넣기 (English)" })).toBeChecked();
    expect(document.querySelector('input[name="baseRevisionNo"]')).toHaveValue("3");
    expect(screen.getByText(/고친 관리자: 도우미/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "수정본" })).toHaveAttribute(
      "href",
      "/admin/release-notes/5/revisions",
    );
    expect(screen.getByRole("link", { name: "이 노트의 작업 기록" })).toHaveAttribute(
      "href",
      "/admin/audit-log?targetType=RELEASE_NOTE&targetId=5",
    );
    expect(screen.queryByRole("link", { name: "독자에게 보기" })).toBeNull();
    expect(screen.getByRole("button", { name: "게시" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeInTheDocument();
  });

  it("처음 게시한 뒤: 버전 읽기 전용, 삭제 없음, 게시 상태면 독자에게 보기와 게시 중단", async () => {
    renderEdit("/admin/release-notes/5", {
      [`GET ${BASE}/5`]: ok(
        note({
          status: "PUBLISHED",
          firstPublishedAt: "2026-10-07T00:00:00Z",
          publishedAt: "2026-10-07T00:00:00Z",
        }),
      ),
    });

    expect(await screen.findByRole("textbox", { name: "버전" })).toHaveAttribute("readonly");
    expect(screen.getByText("처음 게시한 뒤라 버전을 바꿀 수 없습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).toBeNull();
    expect(screen.getByRole("button", { name: "게시 중단" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "독자에게 보기" })).toHaveAttribute(
      "href",
      "/updates/v1.4.0",
    );
  });

  it("미리보기는 입력을 유지하고 그 언어판 아래에 그린다", async () => {
    renderEdit("/admin/release-notes/5", {
      [`GET ${BASE}/5`]: ok(note()),
      [`POST ${BASE}/preview`]: ok({
        contentHtml: '<h2 id="changes">바뀐 점</h2>',
        toc: [{ level: 2, text: "바뀐 점", anchor: "changes" }],
      }),
    });
    const title = await screen.findByRole("textbox", { name: "제목 (한국어)" });
    fireEvent.change(title, { target: { value: "고친 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "미리보기 (한국어)" }));

    const preview = await screen.findByRole("region", { name: "미리보기: 한국어" });
    expect(within(preview).getByRole("heading", { name: "바뀐 점", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "제목 (한국어)" })).toHaveValue("고친 제목");
  });

  it("충돌이면 안내와 최신 내용 열기(새 창), 입력 유지", async () => {
    renderEdit("/admin/release-notes/5", {
      [`GET ${BASE}/5`]: ok(note()),
      [`PUT ${BASE}/5`]: fail(409, "RELEASE_NOTE_REVISION_CONFLICT"),
    });
    const title = await screen.findByRole("textbox", { name: "제목 (한국어)" });
    fireEvent.change(title, { target: { value: "내 수정" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("다른 관리자가 먼저 저장했습니다.");
    const latest = within(alert).getByRole("link", { name: "최신 내용 열기" });
    expect(latest).toHaveAttribute("href", "/admin/release-notes/5");
    expect(latest).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("textbox", { name: "제목 (한국어)" })).toHaveValue("내 수정");
  });

  it("필드 오류는 입력란 옆에(버전 형식, 한국어판 제목 필수)", async () => {
    renderEdit("/admin/release-notes/new", {
      [`POST ${BASE}`]: fail(400, "VALIDATION_FAILED", [
        { field: "version", code: "INVALID_FORMAT" },
        { field: "contents.ko.title", code: "REQUIRED" },
      ]),
    });
    fireEvent.click(await screen.findByRole("button", { name: "초안 저장" }));
    const version = await screen.findByRole("textbox", { name: "버전" });
    await screen.findByText((_, element) => element?.id === "version-error");
    expect(version).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById("contents.ko.title-error")).not.toBeNull();
    expect(screen.getByRole("textbox", { name: "제목 (한국어)" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("다른 오류는 알림 문구(버전 중복)", async () => {
    renderEdit("/admin/release-notes/5", {
      [`GET ${BASE}/5`]: ok(note()),
      [`PUT ${BASE}/5`]: fail(409, "RELEASE_NOTE_VERSION_TAKEN"),
    });
    fireEvent.click(await screen.findByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("이미 있는 버전입니다.");
  });

  it("게시하면 안내", async () => {
    renderEdit("/admin/release-notes/5", {
      [`GET ${BASE}/5`]: ok(note()),
      [`POST ${BASE}/5/publish`]: ok(note({ status: "PUBLISHED" })),
    });
    const form = (await screen.findByRole("button", { name: "게시" })).closest("form")!;
    fireEvent.click(within(form).getByRole("checkbox", { name: "게시를 확인했습니다" }));
    fireEvent.click(within(form).getByRole("button", { name: "게시" }));
    expect(await screen.findByText("게시했습니다.")).toBeInTheDocument();
  });

  it("?fromRevision=이면 그 수정본으로 채웠다는 안내", async () => {
    renderEdit("/admin/release-notes/5?fromRevision=1", {
      [`GET ${BASE}/5`]: ok(note()),
      [`GET ${BASE}/5/revisions/1`]: ok(revision),
    });
    expect(
      await screen.findByText("수정본 1의 내용으로 채웠습니다. 저장하면 새 수정본이 됩니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "제목 (한국어)" })).toHaveValue("처음");
    expect(screen.getByRole("checkbox", { name: "이 언어판 넣기 (English)" })).not.toBeChecked();
  });
});
