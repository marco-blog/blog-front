// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Exclusion } from "~/api/models";
import Exclusions, { action, loader } from "~/routes/admin/exclusions";

import { ME, loggedIn, member, stub } from "../support/admin";
import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type Args = Parameters<typeof action>[0];
const LIST = "GET /api/v1/admin/portal/exclusions";

const exclusion = (postId: number, reason = "광고"): Exclusion => ({
  post: { id: postId, title: `제외한 글 ${postId}`, blogHandle: "marco" },
  reason,
  excludedBy: { userId: 1, nickname: "운영자" } as Exclusion["excludedBy"],
  createdAt: "2026-10-05T00:00:00Z",
  updatedAt: "2026-10-05T00:00:00Z",
});

const post = (fields: Record<string, string>) =>
  action(routeArgs<Args>(formRequest("/admin/portal/exclusions", fields, loggedIn)));

/** 포털 제외(003 T092) */
describe("포털 제외 loader·action", () => {
  it("loader: 페이지(0부터)로 목록과 전체 수", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      [LIST]: ok([exclusion(5)], { totalCount: 1 }),
    });

    await expect(
      loader(
        routeArgs<Parameters<typeof loader>[0]>(
          getRequest("/admin/portal/exclusions?page=2", loggedIn),
        ),
      ),
    ).resolves.toEqual({ page: 2, exclusions: [exclusion(5)], totalCount: 1 });
    expect(Object.fromEntries(backend.callsTo(LIST)[0].url.searchParams)).toEqual({
      page: "1",
      size: "20",
    });
  });

  it("제외·사유 수정은 PUT, 해제는 DELETE /admin/portal/exclusions/{postId}", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "PUT /api/v1/admin/portal/exclusions/123": ok(exclusion(123)),
      "DELETE /api/v1/admin/portal/exclusions/123": ok(null),
    });

    expect(
      asData(
        await post({
          intent: "exclude",
          postRef: "https://blog.java21.net/marco/123",
          reason: " 광고 ",
        }),
      ).data,
    ).toEqual({ intent: "exclude", ok: true });
    await post({ intent: "unexclude", postRef: "123" });

    expect(backend.callsTo("PUT /api/v1/admin/portal/exclusions/123")[0].body).toEqual({
      reason: "광고",
    });
    expect(backend.callsTo("DELETE /api/v1/admin/portal/exclusions/123")).toHaveLength(1);
  });

  it("사유가 비거나 500자를 넘으면, 글 지정이 틀리면 backend를 부르지 않는다", async () => {
    const backend = mockBackend({ [ME]: ok(member()) });

    expect(asData(await post({ intent: "exclude", postRef: "1", reason: " " })).data).toMatchObject(
      {
        fieldErrors: [{ field: "reason", code: "REQUIRED" }],
      },
    );
    expect(
      asData(await post({ intent: "exclude", postRef: "1", reason: "가".repeat(501) })).data,
    ).toMatchObject({ fieldErrors: [{ field: "reason", code: "TOO_LONG", params: { max: 500 } }] });
    expect(asData(await post({ intent: "exclude", postRef: "x", reason: "a" })).data).toMatchObject(
      {
        fieldErrors: [{ field: "postRef", code: "INVALID_FORMAT" }],
      },
    );
    expect(asData(await post({ intent: "nope" })).init?.status).toBe(400);
    expect(backend.calls.every((call) => call.path === "/api/v1/me")).toBe(true);
  });

  it("PORTAL_EXCLUSION_NOT_FOUND·POST_NOT_FOUND는 폼 오류, 관리자 아님은 404", async () => {
    mockBackend({
      [ME]: ok(member()),
      "DELETE /api/v1/admin/portal/exclusions/9": fail(404, "PORTAL_EXCLUSION_NOT_FOUND"),
      "PUT /api/v1/admin/portal/exclusions/9": fail(404, "POST_NOT_FOUND"),
    });

    expect(asData(await post({ intent: "unexclude", postRef: "9" })).data).toMatchObject({
      ok: false,
      resultCode: "PORTAL_EXCLUSION_NOT_FOUND",
    });
    expect(asData(await post({ intent: "exclude", postRef: "9", reason: "a" })).data).toMatchObject(
      { resultCode: "POST_NOT_FOUND" },
    );

    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(post({ intent: "unexclude", postRef: "9" })))).toBe(404);
  });
});

describe("포털 제외 화면", () => {
  function renderExclusions(routes: Record<string, BackendHandler | Response> = {}) {
    const backend = mockBackend({
      [ME]: ok(member()),
      [LIST]: ok([exclusion(5), exclusion(6, "도배")], { totalCount: 2 }),
      ...routes,
    });
    renderRoutes(
      [
        {
          path: "admin/portal/exclusions",
          loader: stub(loader),
          action: stub(action),
          Component: Exclusions,
        },
      ],
      { initialEntries: ["/admin/portal/exclusions"] },
    );
    return backend;
  }

  it("목록: 글 링크·처리자·사유, 새로 제외하면 안내", async () => {
    const backend = renderExclusions({
      "PUT /api/v1/admin/portal/exclusions/77": ok(exclusion(77)),
    });

    const first = await screen.findByRole("region", { name: "제외한 글 5" });
    expect(within(first).getByRole("link", { name: "제외한 글 5" })).toHaveAttribute(
      "href",
      "/marco/5",
    );
    expect(first).toHaveTextContent("운영자");
    expect(within(first).getByLabelText("사유")).toHaveValue("광고");

    const add = screen.getByRole("group", { name: "글 제외" }) as HTMLElement;
    fireEvent.change(within(add).getByLabelText("글 주소 또는 번호"), {
      target: { value: "/marco/77" },
    });
    fireEvent.change(within(add).getByLabelText("사유"), { target: { value: "스팸" } });
    fireEvent.click(within(add).getByRole("button", { name: "제외" }));

    expect(await screen.findByRole("status")).toHaveTextContent("포털에서 제외했습니다.");
    expect(backend.callsTo("PUT /api/v1/admin/portal/exclusions/77")[0].body).toEqual({
      reason: "스팸",
    });
  });

  it("사유 수정과 해제", async () => {
    const backend = renderExclusions({
      "PUT /api/v1/admin/portal/exclusions/6": ok(exclusion(6, "도배 반복")),
      "DELETE /api/v1/admin/portal/exclusions/6": ok(null),
    });

    const second = await screen.findByRole("region", { name: "제외한 글 6" });
    fireEvent.change(within(second).getByLabelText("사유"), { target: { value: "도배 반복" } });
    fireEvent.click(within(second).getByRole("button", { name: "사유 저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent("포털에서 제외했습니다.");

    fireEvent.click(
      within(await screen.findByRole("region", { name: "제외한 글 6" })).getByRole("button", {
        name: "제외 해제",
      }),
    );
    expect(await screen.findByText("제외를 해제했습니다.")).toBeInTheDocument();
    expect(backend.callsTo("PUT /api/v1/admin/portal/exclusions/6")[0].body).toEqual({
      reason: "도배 반복",
    });
    expect(backend.callsTo("DELETE /api/v1/admin/portal/exclusions/6")).toHaveLength(1);
  });

  it("해제 오류 문구(PORTAL_EXCLUSION_NOT_FOUND), 목록이 비면 안내", async () => {
    renderExclusions({
      "DELETE /api/v1/admin/portal/exclusions/5": fail(404, "PORTAL_EXCLUSION_NOT_FOUND"),
    });

    const first = await screen.findByRole("region", { name: "제외한 글 5" });
    fireEvent.click(within(first).getByRole("button", { name: "제외 해제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("포털에서 제외되지 않은 글입니다.");
  });

  it("목록이 비면 안내", async () => {
    renderExclusions({ [LIST]: ok([], { totalCount: 0 }) });

    expect(await screen.findByText("제외한 글이 없습니다.")).toBeInTheDocument();
  });
});
