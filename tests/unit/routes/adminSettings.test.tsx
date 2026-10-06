// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Setting } from "~/api/models";
import Settings, { PORTAL_SETTING_KEYS, action, loader } from "~/routes/admin/settings";

import { ME, loggedIn, member, stub } from "../support/admin";
import { fail, mockBackend, ok, type BackendHandler } from "../support/backend";
import { renderRoutes } from "../support/render";
import { asData, caught, formRequest, getRequest, routeArgs, statusOf } from "../support/route";

type Args = Parameters<typeof action>[0];
const LIST = "GET /api/v1/admin/settings";
const weights = {
  view: 1,
  readComplete: 3,
  like: 5,
  comment: 4,
  halfLifeHours: 24,
  reportPenalty: 0.5,
};
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
const settings = [
  setting("portal.score-weights", { ...weights, like: 8 }, weights, true),
  setting("portal.new-member-delay", "PT48H", "PT24H", true),
  setting("portal.min-content-length", 200, 200),
  setting("portal.topic-auto-hide-threshold", 3, 3),
  setting("portal.unknown", 1, 1),
];
const weightFields = (overrides: Record<string, string> = {}) => ({
  "weights.view": "1",
  "weights.readComplete": "3",
  "weights.like": "5",
  "weights.comment": "4",
  "weights.halfLifeHours": "24",
  "weights.reportPenalty": "0.5",
  ...overrides,
});

const post = (fields: Record<string, string>) =>
  action(routeArgs<Args>(formRequest("/admin/portal/settings", fields, loggedIn)));

/** 포털 설정(003 T092) */
describe("포털 설정 loader·action", () => {
  it("loader: GET /admin/settings?prefix=portal.", async () => {
    const backend = mockBackend({ [ME]: ok(member()), [LIST]: ok(settings) });

    await expect(
      loader(
        routeArgs<Parameters<typeof loader>[0]>(getRequest("/admin/portal/settings", loggedIn)),
      ),
    ).resolves.toEqual({ settings });
    expect(backend.callsTo(LIST)[0].url.searchParams.get("prefix")).toBe("portal.");
  });

  it("저장: 가중치 6개 객체, 대기 시간은 시간 → ISO 기간, 정수 값", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "PUT /api/v1/admin/settings/portal.score-weights": ok(settings[0]),
      "PUT /api/v1/admin/settings/portal.new-member-delay": ok(settings[1]),
      "PUT /api/v1/admin/settings/portal.min-content-length": ok(settings[2]),
    });

    expect(
      asData(await post({ intent: "save", key: "portal.score-weights", ...weightFields() })).data,
    ).toEqual({ intent: "save", ok: true, key: "portal.score-weights" });
    await post({ intent: "save", key: "portal.new-member-delay", value: "1.5" });
    await post({ intent: "save", key: "portal.min-content-length", value: "300" });

    expect(backend.callsTo("PUT /api/v1/admin/settings/portal.score-weights")[0].body).toEqual({
      value: weights,
    });
    expect(backend.callsTo("PUT /api/v1/admin/settings/portal.new-member-delay")[0].body).toEqual({
      value: "PT90M",
    });
    expect(backend.callsTo("PUT /api/v1/admin/settings/portal.min-content-length")[0].body).toEqual(
      { value: 300 },
    );
  });

  it("기본값으로: DELETE /admin/settings/{key}", async () => {
    const backend = mockBackend({
      [ME]: ok(member()),
      "DELETE /api/v1/admin/settings/portal.new-member-delay": ok(settings[1]),
    });

    expect(asData(await post({ intent: "reset", key: "portal.new-member-delay" })).data).toEqual({
      intent: "reset",
      ok: true,
      key: "portal.new-member-delay",
    });
    expect(backend.callsTo("DELETE /api/v1/admin/settings/portal.new-member-delay")).toHaveLength(
      1,
    );
  });

  it("빈 값·숫자 아님·음수 대기 시간은 backend를 부르지 않고, 모르는 키·intent는 400", async () => {
    const backend = mockBackend({ [ME]: ok(member()) });

    expect(
      asData(
        await post({
          intent: "save",
          key: "portal.score-weights",
          ...weightFields({ "weights.like": "", "weights.view": "abc" }),
        }),
      ).data,
    ).toMatchObject({
      key: "portal.score-weights",
      fieldErrors: [
        { field: "weights.view", code: "INVALID" },
        { field: "weights.like", code: "REQUIRED" },
      ],
    });
    expect(
      asData(await post({ intent: "save", key: "portal.new-member-delay", value: "-1" })).data,
    ).toMatchObject({ fieldErrors: [{ field: "value", code: "INVALID" }] });
    expect(
      asData(await post({ intent: "save", key: "portal.other", value: "1" })).init?.status,
    ).toBe(400);
    expect(asData(await post({ intent: "x", key: "portal.score-weights" })).init?.status).toBe(400);
    expect(backend.calls.every((call) => call.path === "/api/v1/me")).toBe(true);
  });

  it("backend 필드 오류 value.like는 화면 입력란 weights.like로, 관리자 아님은 404", async () => {
    mockBackend({
      [ME]: ok(member()),
      "PUT /api/v1/admin/settings/portal.score-weights": fail(400, "VALIDATION_FAILED", [
        { field: "value.like", code: "INVALID", params: { min: 0, max: 1000 } },
      ]),
    });

    expect(
      asData(await post({ intent: "save", key: "portal.score-weights", ...weightFields() })).data,
    ).toMatchObject({
      ok: false,
      key: "portal.score-weights",
      fieldErrors: [{ field: "weights.like", code: "INVALID" }],
    });

    mockBackend({ [ME]: ok(member("USER")) });
    expect(statusOf(await caught(post({ intent: "reset", key: "portal.score-weights" })))).toBe(
      404,
    );
  });
});

describe("포털 설정 화면", () => {
  function renderSettings(routes: Record<string, BackendHandler | Response> = {}) {
    const backend = mockBackend({ [ME]: ok(member()), [LIST]: ok(settings), ...routes });
    renderRoutes(
      [
        {
          path: "admin/portal/settings",
          loader: stub(loader),
          action: stub(action),
          Component: Settings,
        },
      ],
      { initialEntries: ["/admin/portal/settings"] },
    );
    return backend;
  }

  it("네 설정의 지금 값과 기본값, 바꾼 사람, 바뀐 설정만 기본값으로 버튼", async () => {
    renderSettings();

    const score = await screen.findByRole("region", { name: "인기 점수 가중치" });
    expect(within(score).getByLabelText(/좋아요 가중치/)).toHaveValue(8);
    expect(within(score).getByLabelText(/반감기/)).toHaveValue(24);
    expect(within(score).getByLabelText(/신고 감점/)).toHaveValue(0.5);
    expect(score).toHaveTextContent("기본값: 5");
    expect(score).toHaveTextContent("운영자 님이");
    expect(within(score).getByRole("button", { name: "기본값으로" })).toBeInTheDocument();

    const delay = screen.getByRole("region", { name: "신규 회원 대기 시간" });
    expect(within(delay).getByLabelText(/대기 시간\(시간\)/)).toHaveValue(48);
    expect(delay).toHaveTextContent("기본값: 24");

    const length = screen.getByRole("region", { name: "최소 본문 길이" });
    expect(within(length).getByLabelText(/글자 수/)).toHaveValue(200);
    expect(length).toHaveTextContent("기본값을 쓰고 있습니다.");
    expect(within(length).queryByRole("button", { name: "기본값으로" })).toBeNull();
    expect(screen.getByRole("region", { name: "주제 자동 숨김 기준" })).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(PORTAL_SETTING_KEYS.length);
  });

  it("저장·기본값으로 하면 그 설정 영역에 안내", async () => {
    const backend = renderSettings({
      "PUT /api/v1/admin/settings/portal.min-content-length": ok(settings[2]),
      "DELETE /api/v1/admin/settings/portal.new-member-delay": ok(settings[1]),
    });

    const length = await screen.findByRole("region", { name: "최소 본문 길이" });
    fireEvent.change(within(length).getByLabelText(/글자 수/), { target: { value: "150" } });
    fireEvent.click(within(length).getByRole("button", { name: "저장" }));
    expect(await within(length).findByRole("status")).toHaveTextContent("설정을 저장했습니다.");
    expect(backend.callsTo("PUT /api/v1/admin/settings/portal.min-content-length")[0].body).toEqual(
      { value: 150 },
    );

    const delay = screen.getByRole("region", { name: "신규 회원 대기 시간" });
    fireEvent.click(within(delay).getByRole("button", { name: "기본값으로" }));
    expect(await within(delay).findByRole("status")).toHaveTextContent("기본값으로 되돌렸습니다.");
  });

  it("필드 오류 문구는 그 설정 영역에(가중치 이름으로)", async () => {
    renderSettings({
      "PUT /api/v1/admin/settings/portal.score-weights": fail(400, "VALIDATION_FAILED", [
        { field: "value.like", code: "INVALID", params: { min: 0, max: 1000 } },
      ]),
    });

    const score = await screen.findByRole("region", { name: "인기 점수 가중치" });
    fireEvent.click(within(score).getByRole("button", { name: "저장" }));

    const alert = await within(score).findByRole("alert");
    expect(alert).toHaveTextContent("좋아요 가중치: 올바르지 않은 값입니다.");
  });
});
