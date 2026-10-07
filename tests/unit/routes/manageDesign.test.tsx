// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SIDEBAR_ITEM_TYPES, type SidebarConfig } from "~/api/models";
import Design, { action, loader, meta, sidebarFromForm } from "~/routes/manage/design";

import { fail, mockBackend, ok } from "../support/backend";
import { postSummary } from "../support/fixtures";
import { renderRoutes, rootData } from "../support/render";
import { asData, caught, getRequest, routeArgs, statusOf, withCookie } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type MetaArgs = Parameters<typeof meta>[0];

const ME = "GET /api/v1/me";
const CONFIG = "GET /api/v1/blogs/marco/manage/sidebar";
const NOTICES = "GET /api/v1/blogs/marco/notices";
const PUT = "PUT /api/v1/blogs/marco/sidebar";
const BULK = "POST /api/v1/blogs/marco/manage/posts/bulk";
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

const DEFAULT_ON = new Set([
  "PROFILE",
  "CATEGORIES",
  "RECENT_POSTS",
  "TAGS",
  "ARCHIVE",
  "SEARCH",
  "FEED_LINKS",
]);
const config: SidebarConfig = {
  items: SIDEBAR_ITEM_TYPES.map((type) => ({ type, enabled: DEFAULT_ON.has(type) })),
};

function form(fields: [string, string][]): FormData {
  const data = new FormData();
  for (const [key, value] of fields) data.append(key, value);
  return data;
}
const orderFields = (): [string, string][] => SIDEBAR_ITEM_TYPES.map((type) => ["order", type]);

describe("사이드바 폼 값(sidebarFromForm)", () => {
  it("순서 10개와 켠 항목", () => {
    const result = sidebarFromForm(
      form([...orderFields(), ["enabled", "PROFILE"], ["enabled", "VISITORS"]]),
    );
    expect(result?.items).toHaveLength(10);
    expect(result?.items.filter((item) => item.enabled).map((item) => item.type)).toEqual([
      "PROFILE",
      "VISITORS",
    ]);
  });

  it("위로·아래로는 한 칸 옮긴다(끝에서는 그대로)", () => {
    const up = sidebarFromForm(form([...orderFields(), ["move", "up:ARCHIVE"]]));
    expect(up?.items.map((item) => item.type).slice(5, 7)).toEqual(["ARCHIVE", "TAGS"]);
    const down = sidebarFromForm(form([...orderFields(), ["move", "down:PROFILE"]]));
    expect(down?.items.map((item) => item.type).slice(0, 2)).toEqual(["CATEGORIES", "PROFILE"]);
    const top = sidebarFromForm(form([...orderFields(), ["move", "up:PROFILE"]]));
    expect(top?.items[0].type).toBe("PROFILE");
    const bottom = sidebarFromForm(form([...orderFields(), ["move", "down:FEED_LINKS"]]));
    expect(bottom?.items[9].type).toBe("FEED_LINKS");
  });

  it("항목이 빠지거나 겹치거나 모르는 값이면 null", () => {
    expect(sidebarFromForm(form(orderFields().slice(1)))).toBeNull();
    expect(sidebarFromForm(form([...orderFields().slice(1), ["order", "CATEGORIES"]]))).toBeNull();
    expect(sidebarFromForm(form([...orderFields().slice(1), ["order", "HACK"]]))).toBeNull();
  });
});

describe("꾸미기 loader·action", () => {
  it("loader: 사이드바 구성과 공지 목록(size=50)", async () => {
    const notices = [postSummary(3, { notice: true })];
    const backend = mockBackend({ [ME]: ok(me), [CONFIG]: ok(config), [NOTICES]: ok(notices) });

    await expect(
      loader(
        routeArgs<LoaderArgs>(getRequest("/marco/manage/design", loggedIn), { handle: "marco" }),
      ),
    ).resolves.toEqual({ handle: "marco", items: config.items, notices });
    expect(backend.callsTo(NOTICES)[0].url.searchParams.get("size")).toBe("50");
  });

  it("loader: backend 403은 404", async () => {
    mockBackend({ [ME]: ok(me), [CONFIG]: fail(403, "FORBIDDEN"), [NOTICES]: ok([]) });
    expect(
      statusOf(
        await caught(
          loader(
            routeArgs<LoaderArgs>(getRequest("/marco/manage/design", loggedIn), {
              handle: "marco",
            }),
          ),
        ),
      ),
    ).toBe(404);
  });

  const callAction = (fields: [string, string][]) => {
    const body = new URLSearchParams(fields);
    return action(
      routeArgs<ActionArgs>(
        new Request("http://front.test/marco/manage/design", {
          method: "POST",
          body,
          headers: { origin: "http://front.test", ...loggedIn },
        }),
        { handle: "marco" },
      ),
    );
  };

  it("saveSidebar: PUT 본문은 10개 항목 순서대로", async () => {
    const backend = mockBackend({ [ME]: ok(me), [PUT]: ok(config) });

    const result = asData(
      await callAction([
        ["intent", "saveSidebar"],
        ...orderFields(),
        ["enabled", "VISITORS"],
        ["move", "up:VISITORS"],
      ]),
    );

    expect(result.data).toEqual({ intent: "saveSidebar", ok: true });
    const body = backend.callsTo(PUT)[0].body as SidebarConfig;
    expect(body.items.map((item) => item.type)).toEqual([
      "PROFILE",
      "CATEGORIES",
      "RECENT_POSTS",
      "RECENT_COMMENTS",
      "POPULAR_POSTS",
      "TAGS",
      "VISITORS",
      "ARCHIVE",
      "SEARCH",
      "FEED_LINKS",
    ]);
    expect(body.items.filter((item) => item.enabled).map((item) => item.type)).toEqual([
      "VISITORS",
    ]);
  });

  it("unnotice: 일괄 작업 UNNOTICE", async () => {
    const backend = mockBackend({ [ME]: ok(me), [BULK]: ok({ updated: 1 }) });
    expect(
      asData(
        await callAction([
          ["intent", "unnotice"],
          ["postId", "3"],
        ]),
      ).data,
    ).toEqual({
      intent: "unnotice",
      ok: true,
    });
    expect(backend.callsTo(BULK)[0].body).toEqual({ postIds: [3], action: "UNNOTICE" });
  });

  it("잘못된 값은 backend를 부르지 않고 400, backend 오류는 코드", async () => {
    const backend = mockBackend({
      [ME]: ok(me),
      [PUT]: fail(400, "VALIDATION_FAILED", [{ field: "items", code: "INVALID" }]),
    });
    expect(
      asData(
        await callAction([
          ["intent", "saveSidebar"],
          ["order", "PROFILE"],
        ]),
      ).init?.status,
    ).toBe(400);
    expect(
      asData(
        await callAction([
          ["intent", "unnotice"],
          ["postId", "x"],
        ]),
      ).init?.status,
    ).toBe(400);
    expect(asData(await callAction([["intent", "hack"]])).init?.status).toBe(400);
    expect(backend.callsTo(PUT)).toHaveLength(0);
    const failed = asData(await callAction([["intent", "saveSidebar"], ...orderFields()]));
    expect(failed.data).toMatchObject({ ok: false, resultCode: "VALIDATION_FAILED" });
  });

  it("meta는 noindex", () => {
    expect(
      meta({ matches: [{ id: "root", loaderData: rootData("ko") }] } as unknown as MetaArgs),
    ).toEqual([{ title: "꾸미기 - 블로그" }, { name: "robots", content: "noindex" }]);
  });
});

describe("꾸미기 화면", () => {
  function renderDesign(routes: Record<string, Response>) {
    const backend = mockBackend({ [ME]: ok(me), [CONFIG]: ok(config), ...routes });
    renderRoutes(
      [
        {
          path: ":handle/manage/design",
          loader: withCookie(loader as never) as never,
          action: withCookie(action as never) as never,
          Component: Design,
        },
      ],
      { initialEntries: ["/marco/manage/design"] },
    );
    return backend;
  }

  it("항목 켜기·끄기와 위로·아래로가 폼 버튼, 저장하면 안내", async () => {
    const backend = renderDesign({ [NOTICES]: ok([]), [PUT]: ok(config) });

    const editor = await screen.findByRole("form", { name: "사이드바" });
    const items = within(editor).getAllByRole("listitem");
    expect(items.map((item) => within(item).getByRole("checkbox").getAttribute("value"))).toEqual([
      ...SIDEBAR_ITEM_TYPES,
    ]);
    expect(within(editor).getByLabelText("방문자")).not.toBeChecked();
    expect(within(editor).getByRole("button", { name: "프로필 위로" })).toBeDisabled();
    expect(within(editor).getByRole("button", { name: "피드 아래로" })).toBeDisabled();

    fireEvent.click(within(editor).getByLabelText("방문자"));
    fireEvent.click(within(editor).getByRole("button", { name: "사이드바 저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent("사이드바를 저장했습니다.");
    const body = backend.callsTo(PUT)[0].body as SidebarConfig;
    expect(body.items.find((item) => item.type === "VISITORS")?.enabled).toBe(true);
  });

  it("위로를 누르면 그 항목을 옮겨 저장한다", async () => {
    const backend = renderDesign({ [NOTICES]: ok([]), [PUT]: ok(config) });

    fireEvent.click(await screen.findByRole("button", { name: "보관함 위로" }));
    await screen.findByRole("status");
    const body = backend.callsTo(PUT)[0].body as SidebarConfig;
    expect(body.items.map((item) => item.type).indexOf("ARCHIVE")).toBe(5);
  });

  it("공지 목록과 공지 해제", async () => {
    const backend = renderDesign({
      [NOTICES]: ok([postSummary(3, { title: "운영 공지", notice: true })]),
      [BULK]: ok({ updated: 1 }),
    });

    const list = await screen.findByRole("list", { name: "공지 목록" });
    expect(within(list).getByRole("link", { name: "운영 공지" })).toHaveAttribute(
      "href",
      "/marco/3",
    );
    fireEvent.click(within(list).getByRole("button", { name: "운영 공지 공지 해제" }));
    expect(await screen.findByRole("status")).toHaveTextContent("공지를 해제했습니다.");
    expect(backend.callsTo(BULK)[0].body).toEqual({ postIds: [3], action: "UNNOTICE" });
  });

  it("공지가 없으면 안내, 오류는 문구", async () => {
    renderDesign({ [NOTICES]: ok([]), [PUT]: fail(500, "INTERNAL_ERROR") });
    expect(await screen.findByText("공지로 등록한 글이 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("서버에 문제가 생겼습니다.");
  });
});
