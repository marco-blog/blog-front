import { describe, expect, it } from "vitest";

import { action, loader } from "~/routes/updates/seen";

import { fail, mockBackend, ok } from "../support/backend";
import { asData, expectRedirect, formRequest, routeArgs } from "../support/route";

type Args = Parameters<typeof action>[0];
const ME = "GET /api/v1/me";
const SEEN = "POST /api/v1/me/release-notes/seen";
const member = {
  userId: 7,
  email: "m@example.com",
  nickname: "마르코",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "ko",
  timeZone: "Asia/Seoul",
  blogs: [],
  unseenReleaseNote: null,
  unreadNotificationCount: 0,
};
const submit = (fields: Record<string, string>, cookie = "access_token=a") =>
  action(routeArgs<Args>(formRequest("/updates/seen", fields, { cookie })));

/** 배너 닫기 리소스 라우트(003 T115) */
describe("/updates/seen", () => {
  it("seen API를 부른 뒤 같은 사이트 next로 리다이렉트", async () => {
    const backend = mockBackend({ [ME]: ok(member), [SEEN]: ok(null) });

    expect(expectRedirect(await submit({ version: "1.3.0", next: "/marco/12?page=2" }))).toBe(
      "/marco/12?page=2",
    );
    expect(backend.callsTo(SEEN)[0].body).toEqual({ version: "1.3.0" });
  });

  it.each(["https://evil.example/", "//evil.example", "", "\\\\evil"])(
    "외부·잘못된 next(%s)는 /",
    async (next) => {
      mockBackend({ [ME]: ok(member), [SEEN]: ok(null) });

      expect(expectRedirect(await submit({ version: "1.3.0", next }))).toBe("/");
    },
  );

  it("JS(fetcher, js=1)에는 이동 없이 결과만, 저장 실패·비로그인·잘못된 버전은 API 없이도 닫는다", async () => {
    const backend = mockBackend({ [ME]: ok(member), [SEEN]: fail(500, "INTERNAL_ERROR") });

    expect(asData(await submit({ version: "1.3.0", next: "/", js: "1" })).data).toEqual({
      ok: true,
    });
    expect(backend.callsTo(SEEN)).toHaveLength(1);

    const anonymous = mockBackend({ [ME]: fail(401, "UNAUTHENTICATED") });
    expect(expectRedirect(await submit({ version: "1.3.0", next: "/a" }, "lang=ko"))).toBe("/a");
    expect(anonymous.callsTo(SEEN)).toHaveLength(0);

    const invalid = mockBackend({ [ME]: ok(member) });
    await submit({ version: "1.3", next: "/" });
    expect(invalid.callsTo(SEEN)).toHaveLength(0);
  });

  it("주소로 열면 /updates로", () => {
    expect(expectRedirect(loader())).toBe("/updates");
  });
});
