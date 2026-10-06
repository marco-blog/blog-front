// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { CategoryNode } from "~/api/models";
import Categories, { action, loader, meta, orderChange } from "~/routes/manage/categories";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
  withCookie,
} from "../support/route";

type Args<F extends (...args: never[]) => unknown> = Parameters<F>[0];

const ME = "GET /api/v1/me";
const BASE = "/api/v1/blogs/marco/categories";
const TREE = `GET ${BASE}`;
const ORDER = `PUT ${BASE}/order`;
const loggedIn = { cookie: "access_token=a" };
const me = {
  userId: 7,
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

const tree: CategoryNode[] = [
  {
    id: 1,
    name: "개발",
    postCount: 5,
    children: [
      { id: 2, name: "Spring", postCount: 3, children: [] },
      { id: 3, name: "JPA", postCount: 1, children: [] },
    ],
  },
  { id: 4, name: "일상", postCount: 2, children: [] },
  { id: 5, name: "여행", postCount: 0, children: [] },
];

const stub = (fn: unknown) => withCookie(fn as (args: { request: Request }) => unknown) as never;

describe("orderChange", () => {
  it("위·아래는 형제끼리 자리를 바꾸고 0부터 다시 번호를 매긴다", () => {
    expect(orderChange(tree, "up", 5)).toEqual([
      { id: 1, parentId: null, sortOrder: 0 },
      { id: 5, parentId: null, sortOrder: 1 },
      { id: 4, parentId: null, sortOrder: 2 },
    ]);
    expect(orderChange(tree, "down", 2)).toEqual([
      { id: 3, parentId: 1, sortOrder: 0 },
      { id: 2, parentId: 1, sortOrder: 1 },
    ]);
  });

  it("맨 앞을 위로, 맨 뒤를 아래로, 없는 id는 바꿀 것이 없다", () => {
    expect(orderChange(tree, "up", 1)).toBeNull();
    expect(orderChange(tree, "down", 3)).toBeNull();
    expect(orderChange(tree, "up", 99)).toBeNull();
  });

  it("위치 옮기기는 새 부모의 맨 끝으로, 같은 부모·자기 자신이면 없음", () => {
    expect(orderChange(tree, "parent", 4, 1)).toEqual([
      { id: 2, parentId: 1, sortOrder: 0 },
      { id: 3, parentId: 1, sortOrder: 1 },
      { id: 4, parentId: 1, sortOrder: 2 },
    ]);
    expect(orderChange(tree, "parent", 3, null)).toEqual([
      { id: 1, parentId: null, sortOrder: 0 },
      { id: 4, parentId: null, sortOrder: 1 },
      { id: 5, parentId: null, sortOrder: 2 },
      { id: 3, parentId: null, sortOrder: 3 },
    ]);
    expect(orderChange(tree, "parent", 4, 99)).toEqual([{ id: 4, parentId: 99, sortOrder: 0 }]);
    expect(orderChange(tree, "parent", 2, 1)).toBeNull();
    expect(orderChange(tree, "parent", 4, 4)).toBeNull();
  });
});

describe("카테고리 관리 loader·meta", () => {
  const call = (handle: string) =>
    loader(
      routeArgs<Args<typeof loader>>(getRequest(`/${handle}/manage/categories`, loggedIn), {
        handle,
      }),
    );

  it("내 블로그의 카테고리 트리", async () => {
    mockBackend({ [ME]: ok(me), [TREE]: ok(tree) });
    await expect(call("marco")).resolves.toEqual({ handle: "marco", categories: tree });
  });

  it("남의 블로그는 404, backend 403도 404", async () => {
    mockBackend({ [ME]: ok({ ...me, blogs: [] }) });
    expect(statusOf(await caught(call("marco")))).toBe(404);
    mockBackend({ [ME]: ok(me), [TREE]: fail(403, "FORBIDDEN") });
    expect(statusOf(await caught(call("marco")))).toBe(404);
  });

  it("noindex", () => {
    expect(
      meta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as unknown as Args<
        typeof meta
      >),
    ).toEqual([{ title: "카테고리 관리 - 블로그" }, { name: "robots", content: "noindex" }]);
  });
});

describe("카테고리 관리 action", () => {
  const call = (fields: Record<string, string>) =>
    action(
      routeArgs<Args<typeof action>>(formRequest("/marco/manage/categories", fields, loggedIn), {
        handle: "marco",
      }),
    );

  it("만들기: 이름 앞뒤 공백 제거, 상위가 없으면 parentId null", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [`POST ${BASE}`]: ok({ id: 9, name: "새", postCount: 0, children: [] }, { status: 201 }),
    });

    expect(asData(await call({ intent: "create", name: "  새  ", parentId: "" })).data).toEqual({
      intent: "create",
      ok: true,
    });
    await call({ intent: "create", name: "하위", parentId: "1" });

    expect(backend.callsTo(`POST ${BASE}`).map((c) => c.body)).toEqual([
      { name: "새", parentId: null },
      { name: "하위", parentId: 1 },
    ]);
  });

  it("이름 바꾸기·삭제", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [`PATCH ${BASE}/2`]: ok(tree[0].children[0]),
      [`DELETE ${BASE}/4`]: ok(null),
    });

    await call({ intent: "rename", id: "2", name: "Spring Boot" });
    expect(asData(await call({ intent: "delete", id: "4" })).data).toEqual({
      intent: "delete",
      ok: true,
    });

    expect(backend.callsTo(`PATCH ${BASE}/2`)[0].body).toEqual({ name: "Spring Boot" });
    expect(backend.callsTo(`DELETE ${BASE}/4`)).toHaveLength(1);
  });

  it("순서: 지금 트리를 읽어 형제 순서를 PUT /order로, 바꿀 것이 없으면 부르지 않는다", async () => {
    const backend = mockBackend({ [ME]: ok(me), [TREE]: ok(tree), [ORDER]: ok(tree) });

    await call({ intent: "down", id: "4" });
    await call({ intent: "parent", id: "5", parentId: "1" });
    expect(asData(await call({ intent: "up", id: "1" })).data).toEqual({ intent: "up", ok: true });

    expect(backend.callsTo(ORDER).map((c) => c.body)).toEqual([
      [
        { id: 1, parentId: null, sortOrder: 0 },
        { id: 5, parentId: null, sortOrder: 1 },
        { id: 4, parentId: null, sortOrder: 2 },
      ],
      [
        { id: 2, parentId: 1, sortOrder: 0 },
        { id: 3, parentId: 1, sortOrder: 1 },
        { id: 5, parentId: 1, sortOrder: 2 },
      ],
    ]);
  });

  it("빈 이름·잘못된 id·모르는 작업은 backend를 부르지 않고 400", async () => {
    const backend = mockBackend({ [ME]: ok(me) });

    const empty = asData(await call({ intent: "create", name: "   " }));
    expect(empty.init?.status).toBe(400);
    expect(empty.data).toMatchObject({ fieldErrors: [{ field: "name", code: "REQUIRED" }] });
    expect(asData(await call({ intent: "rename", id: "x", name: "a" })).init?.status).toBe(400);
    expect(asData(await call({ intent: "nope" })).init?.status).toBe(400);
    expect(new Set(backend.calls.map((c) => c.path))).toEqual(new Set(["/api/v1/me"]));
  });

  it("backend 오류는 코드와 상태 그대로", async () => {
    mockBackend({
      [ME]: ok(me),
      [`POST ${BASE}`]: fail(409, "CATEGORY_NAME_TAKEN"),
      [TREE]: ok(tree),
      [ORDER]: fail(422, "CATEGORY_DEPTH_EXCEEDED"),
    });

    const taken = asData(await call({ intent: "create", name: "개발" }));
    expect(taken.init?.status).toBe(409);
    expect(taken.data).toMatchObject({ ok: false, resultCode: "CATEGORY_NAME_TAKEN" });
    const deep = asData(await call({ intent: "parent", id: "4", parentId: "1" }));
    expect(deep.data).toMatchObject({ resultCode: "CATEGORY_DEPTH_EXCEEDED" });
  });
});

describe("카테고리 관리 화면", () => {
  function renderPage(routes: Record<string, BackendHandler | Response>) {
    const backend = mockBackend({ [ME]: ok(me), ...routes });
    renderRoutes(
      [
        {
          path: ":handle/manage/categories",
          loader: stub(loader),
          action: stub(action),
          Component: Categories,
        },
      ],
      { initialEntries: ["/marco/manage/categories"] },
    );
    return backend;
  }

  it("계층 목록, 공개 글 수, 글 관리 링크, 맨 앞·맨 뒤 이동 버튼은 막힘", async () => {
    renderPage({ [TREE]: ok(tree) });

    const list = await screen.findByRole("list", { name: "카테고리 목록" });
    expect(within(list).getByLabelText("개발 이름")).toHaveValue("개발");
    expect(within(list).getByLabelText("Spring 이름")).toHaveValue("Spring");
    expect(list).toHaveTextContent("공개 글 5편");
    expect(within(list).getAllByRole("link", { name: "글 관리에서 보기" })[0]).toHaveAttribute(
      "href",
      "/marco/manage/posts?category=1",
    );
    expect(screen.getByRole("button", { name: "개발 위로" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "여행 아래로" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "일상 위로" })).toBeEnabled();
    // 하위가 있는 카테고리는 다른 카테고리 아래로 옮길 수 없다(2단계).
    expect(screen.queryByLabelText("개발 위치")).toBeNull();
    expect(screen.getByLabelText("Spring 위치")).toHaveValue("1");
  });

  it("만들면 안내하고 트리를 다시 읽는다", async () => {
    let current = tree;
    const backend = renderPage({
      [TREE]: () => ok(current),
      [`POST ${BASE}`]: () => {
        current = [...tree, { id: 6, name: "독서", postCount: 0, children: [] }];
        return ok(current[3], { status: 201 });
      },
    });

    const create = await screen.findByRole("group", { name: "새 카테고리" });
    fireEvent.change(within(create).getByLabelText("이름"), { target: { value: "독서" } });
    fireEvent.change(within(create).getByLabelText("상위 카테고리"), { target: { value: "" } });
    fireEvent.click(within(create).getByRole("button", { name: "만들기" }));

    expect(await screen.findByRole("status")).toHaveTextContent("카테고리를 만들었습니다.");
    expect(await screen.findByLabelText("독서 이름")).toBeInTheDocument();
    expect(backend.callsTo(`POST ${BASE}`)[0].body).toEqual({ name: "독서", parentId: null });
  });

  it("이름 중복은 오류 문구", async () => {
    renderPage({ [TREE]: ok(tree), [`PATCH ${BASE}/4`]: fail(409, "CATEGORY_NAME_TAKEN") });

    const input = await screen.findByLabelText("일상 이름");
    fireEvent.change(input, { target: { value: "여행" } });
    fireEvent.click(within(input.closest("form")!).getByRole("button", { name: "이름 바꾸기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "같은 위치에 이미 같은 이름의 카테고리가 있습니다.",
    );
  });

  it("빈 이름은 입력란 오류", async () => {
    renderPage({ [TREE]: ok(tree) });

    const input = await screen.findByLabelText("일상 이름");
    fireEvent.change(input, { target: { value: " " } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("이름: 필수 입력 항목입니다.");
  });

  it("위로 옮기면 순서 변경 안내", async () => {
    const backend = renderPage({ [TREE]: ok(tree), [ORDER]: ok(tree) });

    fireEvent.click(await screen.findByRole("button", { name: "JPA 위로" }));

    expect(await screen.findByRole("status")).toHaveTextContent("카테고리 순서를 바꿨습니다.");
    expect(backend.callsTo(ORDER)[0].body).toEqual([
      { id: 3, parentId: 1, sortOrder: 0 },
      { id: 2, parentId: 1, sortOrder: 1 },
    ]);
  });

  it("다른 상위로 옮기기, 깊이 초과는 오류 문구", async () => {
    const backend = renderPage({
      [TREE]: ok(tree),
      [ORDER]: fail(422, "CATEGORY_DEPTH_EXCEEDED"),
    });

    const select = await screen.findByLabelText("일상 위치");
    fireEvent.change(select, { target: { value: "1" } });
    fireEvent.click(within(select.closest("form")!).getByRole("button", { name: "옮기기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "카테고리는 2단계까지만 만들 수 있습니다.",
    );
    expect(backend.callsTo(ORDER)[0].body).toContainEqual({ id: 4, parentId: 1, sortOrder: 2 });
  });

  it("삭제는 확인을 거치고, 취소하면 부르지 않는다", async () => {
    let current = tree;
    const backend = renderPage({
      [TREE]: () => ok(current),
      [`DELETE ${BASE}/1`]: () => {
        current = tree.slice(1);
        return ok(null);
      },
    });

    fireEvent.click(await screen.findByRole("button", { name: "개발 삭제" }));
    let confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent(
      "‘개발’ 카테고리를 삭제할까요? 공개 글 5편을 포함한 모든 글이 미분류가 되고, 하위 카테고리도 함께 삭제됩니다.",
    );
    fireEvent.click(within(confirm).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(backend.callsTo(`DELETE ${BASE}/1`)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "개발 삭제" }));
    confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "삭제" }));

    expect(await screen.findByRole("status")).toHaveTextContent("카테고리를 삭제했습니다.");
    expect(backend.callsTo(`DELETE ${BASE}/1`)).toHaveLength(1);
    expect(screen.queryByLabelText("개발 이름")).toBeNull();
  });

  it("카테고리가 없으면 안내", async () => {
    renderPage({ [TREE]: ok([]) });
    expect(await screen.findByText("아직 카테고리가 없습니다.")).toBeInTheDocument();
  });
});
