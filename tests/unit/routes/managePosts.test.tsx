// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Layout, { loader as layoutLoader } from "~/routes/manage/layout";
import Posts, {
  action as postsAction,
  loader as postsLoader,
  parseFilters,
} from "~/routes/manage/posts";

import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { blog, postSummary } from "../support/fixtures";
import { renderRoutes } from "../support/render";
import { asData, routeArgs, withCookie } from "../support/route";

/** 글 관리의 004 예약·보호(T088): 필터, 예약 시각(회원 시간대), 예약 취소 */
const ME = "GET /api/v1/me";
const POSTS = "GET /api/v1/blogs/marco/manage/posts";
const BLOG = "GET /api/v1/blogs/marco";
const me = {
  userId: 7,
  email: "marco@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "America/New_York",
  blogs: [{ handle: "marco", title: "marco 블로그" }],
  unseenReleaseNote: null,
};
const stub = (fn: unknown) => withCookie(fn as (args: { request: Request }) => unknown) as never;

function renderPosts(path: string, routes: Record<string, BackendHandler | Response>) {
  const backend = mockBackend({ [ME]: ok(me), [BLOG]: ok(blog), ...routes });
  renderRoutes(
    [
      {
        path: ":handle/manage",
        loader: stub(layoutLoader),
        Component: Layout,
        children: [
          {
            path: "posts",
            loader: stub(postsLoader),
            action: stub(postsAction),
            Component: Posts,
          },
        ],
      },
    ],
    { initialEntries: [path], timeZone: "America/New_York" },
  );
  return backend;
}

describe("글 관리: 예약·보호(004)", () => {
  it('필터에 상태 "예약"과 공개 범위 "보호"가 있고 그대로 backend에 넘긴다', async () => {
    expect(
      parseFilters(new URLSearchParams("status=SCHEDULED&visibility=PROTECTED")),
    ).toMatchObject({ status: "SCHEDULED", visibility: "PROTECTED" });
    const backend = renderPosts("/marco/manage/posts?status=SCHEDULED&visibility=PROTECTED", {
      [POSTS]: ok([]),
    });

    const status = await screen.findByLabelText("상태");
    expect(within(status).getByRole("option", { name: "예약" })).toBeInTheDocument();
    expect(status).toHaveValue("SCHEDULED");
    expect(screen.getByLabelText("공개 범위")).toHaveValue("PROTECTED");
    const query = backend.callsTo(POSTS)[0].url.searchParams;
    expect(query.get("status")).toBe("SCHEDULED");
    expect(query.get("visibility")).toBe("PROTECTED");
  });

  it("예약 글은 회원 시간대로 예약 시각을 보이고, 예약 취소하면 안내한다", async () => {
    let items = [
      postSummary(5, {
        title: "예약 글",
        status: "SCHEDULED",
        visibility: "PROTECTED",
        publishedAt: null,
        scheduledAt: "2026-11-02T14:30:00Z",
      }),
      postSummary(6, { title: "발행 글" }),
    ];
    const backend = renderPosts("/marco/manage/posts", {
      [POSTS]: () => ok(items),
      "POST /api/v1/posts/5/unschedule": () => {
        items = [{ ...items[0], status: "DRAFT", scheduledAt: null }, items[1]];
        return ok(items[0]);
      },
    });

    const list = await screen.findByRole("list", { name: "글 목록" });
    const scheduled = within(list).getAllByRole("listitem")[0];
    expect(scheduled).toHaveTextContent("예약");
    expect(scheduled).toHaveTextContent("보호");
    expect(scheduled).toHaveTextContent("2026년 11월 2일 오전 9:30 발행 예약");
    expect(
      within(within(list).getAllByRole("listitem")[1]).queryByRole("button", { name: /예약 취소/ }),
    ).toBeNull();

    fireEvent.click(within(scheduled).getByRole("button", { name: "예약 취소: 예약 글" }));
    expect(await screen.findByRole("status")).toHaveTextContent("예약을 취소했습니다.");
    expect(backend.callsTo("POST /api/v1/posts/5/unschedule")).toHaveLength(1);
  });

  it("예약 상태가 아니면(409) 오류 코드를 돌려준다", async () => {
    mockBackend({
      [ME]: ok(me),
      "POST /api/v1/posts/5/unschedule": fail(409, "POST_NOT_SCHEDULED"),
    });
    const request = new Request("http://front.test/marco/manage/posts", {
      method: "POST",
      body: new URLSearchParams({ intent: "unschedule", postId: "5" }),
      headers: { origin: "http://front.test", cookie: "access_token=a" },
    });
    const result = asData(
      await postsAction(routeArgs<Parameters<typeof postsAction>[0]>(request, { handle: "marco" })),
    );
    expect(result.data).toMatchObject({
      intent: "unschedule",
      ok: false,
      resultCode: "POST_NOT_SCHEDULED",
    });
    expect(result.init?.status).toBe(409);
  });
});

describe("글 관리: 트랙백 결과(005 T094)", () => {
  const PINGS = "GET /api/v1/posts/5/trackback-pings";

  it("발행된 글마다 트랙백 결과 펼침, 처음 펼칠 때 한 번만 읽는다", async () => {
    const backend = renderPosts("/marco/manage/posts", {
      [POSTS]: ok([
        postSummary(5, { title: "발행 글", status: "PUBLISHED" }),
        postSummary(6, { title: "임시 글", status: "DRAFT" }),
      ]),
      [PINGS]: ok([
        {
          id: 1,
          targetUrl: "https://other.example/tb",
          status: "FAILED",
          errorCode: "TIMEOUT",
          errorMessage: null,
          attemptedAt: "2026-10-06T05:00:00Z",
          createdAt: "2026-10-06T05:00:00Z",
        },
      ]),
    });

    const toggles = await screen.findAllByText("트랙백 결과");
    expect(toggles).toHaveLength(1);
    const details = toggles[0].closest("details")!;
    expect(details).toHaveTextContent("결과를 보려면 자바스크립트를 켜거나");

    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(await within(details).findByText("https://other.example/tb")).toBeInTheDocument();
    expect(details).toHaveTextContent("실패 응답이 없어 시간이 지났습니다.");

    details.open = false;
    fireEvent(details, new Event("toggle"));
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(backend.callsTo(PINGS)).toHaveLength(1);
  });

  it("결과를 읽지 못하면 안내, 비었으면 빈 안내", async () => {
    renderPosts("/marco/manage/posts", {
      [POSTS]: ok([postSummary(5, { title: "발행 글", status: "PUBLISHED" })]),
      [PINGS]: fail(500, "INTERNAL_ERROR"),
    });

    const details = (await screen.findByText("트랙백 결과")).closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(
      await within(details).findByText("보낸 트랙백 결과를 불러오지 못했습니다."),
    ).toBeInTheDocument();
  });
});
