// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HiddenPosts, { action, loader, meta } from "~/routes/admin/hidden-posts";

import { ME, loggedIn, member, metaArgs, stub } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { preview } from "../support/moderation";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
const LIST = "GET /api/v1/admin/contents/hidden-posts";
const UNHIDE = "DELETE /api/v1/admin/contents/posts/123/hidden";

const post = (fields: Record<string, string>) =>
  action(routeArgs<ActionArgs>(formRequest("/admin/contents/hidden-posts", fields, loggedIn)));

/** 숨긴 글(005 T046) */
describe("admin hidden posts", () => {
  it("loader: 페이지(0부터)로 숨긴 글, 관리자가 아니면 404", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [LIST]: ok([preview({ state: "HIDDEN" })], { totalCount: 1 }),
    });
    const call = (path: string) => loader(routeArgs<LoaderArgs>(getRequest(path, loggedIn)));

    await expect(call("/admin/contents/hidden-posts?page=2")).resolves.toEqual({
      page: 2,
      posts: [preview({ state: "HIDDEN" })],
      totalCount: 1,
    });
    expect(Object.fromEntries(backend.callsTo(LIST)[0].url.searchParams)).toEqual({
      page: "1",
      size: "20",
    });
    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(call("/admin/contents/hidden-posts")))).toBe(404);
    expect(meta(metaArgs())).toContainEqual({ name: "robots", content: "noindex" });
  });

  it("action: 숨김 해제는 DELETE, 잘못된 요청은 400, CONTENT_NOT_FOUND는 폼 오류", async () => {
    const backend = mockBackend({ [ME]: ok(member()), [UNHIDE]: ok(preview()) });

    expect(asData(await post({ intent: "unhide", postId: "123" })).data).toEqual({
      intent: "unhide",
      ok: true,
    });
    expect(backend.callsTo(UNHIDE)).toHaveLength(1);
    expect(asData(await post({ intent: "unhide", postId: "x" })).init?.status).toBe(400);

    mockBackend({ [ME]: ok(member()), [UNHIDE]: fail(404, "CONTENT_NOT_FOUND") });
    expect(asData(await post({ intent: "unhide", postId: "123" })).data).toMatchObject({
      resultCode: "CONTENT_NOT_FOUND",
    });
  });

  it("화면: 숨긴 글 목록과 숨김 해제, 없으면 안내", async () => {
    mockBackend({
      [ME]: ok(member()),
      [LIST]: ok([preview({ state: "HIDDEN" })], { totalCount: 1 }),
      [UNHIDE]: ok(preview()),
    });
    renderRoutes(
      [
        {
          path: "admin/contents/hidden-posts",
          loader: stub(loader),
          action: stub(action),
          Component: HiddenPosts,
        },
      ],
      { initialEntries: ["/admin/contents/hidden-posts"] },
    );

    const list = await screen.findByRole("list", { name: "숨긴 글 목록" });
    const item = within(list).getByRole("region", { name: "광고 글" });
    expect(item).toHaveTextContent("숨김");
    fireEvent.click(within(item).getByRole("button", { name: "숨김 해제" }));
    expect(await screen.findByRole("status")).toHaveTextContent("숨김을 해제했습니다.");
  });

  it("숨긴 글이 없으면 안내", async () => {
    mockBackend({ [ME]: ok(member()), [LIST]: ok([], { totalCount: 0 }) });
    renderRoutes(
      [{ path: "admin/contents/hidden-posts", loader: stub(loader), Component: HiddenPosts }],
      { initialEntries: ["/admin/contents/hidden-posts"] },
    );
    expect(await screen.findByText("숨긴 글이 없습니다.")).toBeInTheDocument();
  });
});
