// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import SettingsLanguage, {
  action,
  loader,
  meta,
  timeZoneOptions,
} from "~/routes/settings.language";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  withCookie,
} from "../support/route";

/**
 * `/settings/language`(T228, T234, FR-149·FR-153, quickstart #27): 화면 언어와 시간대(IANA)를 골라 `PATCH /me`로 저장한다.
 */
const me = {
  userId: 7,
  email: "marco@example.com",
  nickname: "marco",
  bio: null,
  profileImageUrl: null,
  role: "USER",
  locale: "en",
  timeZone: "Asia/Seoul",
  blogs: [],
  unseenReleaseNote: null,
};

const loggedIn = { cookie: "access_token=a" };
type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];

describe("timeZoneOptions", () => {
  it("IANA 시간대 ID 목록(정렬), UTC 포함", () => {
    const zones = timeZoneOptions("Asia/Seoul");
    expect(zones).toEqual(expect.arrayContaining(["Asia/Seoul", "America/New_York", "UTC"]));
    expect(zones).toEqual([...zones].sort());
    expect(new Set(zones).size).toBe(zones.length);
  });

  it("지금 설정값이 목록에 없으면(옛 별칭 등) 더한다", () => {
    expect(timeZoneOptions("Asia/Calcutta")).toContain("Asia/Calcutta");
    expect(timeZoneOptions(null)).not.toContain("");
  });
});

describe("loader", () => {
  it("로그인이 필요하다", async () => {
    mockBackend({ "GET /api/v1/me": fail(401, "UNAUTHENTICATED") });

    const location = expectRedirect(
      await caught(
        loader(routeArgs<LoaderArgs>(getRequest("/settings/language", { cookie: "x=1" }))),
      ),
    );

    expect(location).toBe(`/login?next=${encodeURIComponent("/settings/language")}`);
  });

  it("회원 언어·시간대와 시간대 목록", async () => {
    mockBackend({ "GET /api/v1/me": ok(me) });

    const result = await loader(routeArgs<LoaderArgs>(getRequest("/settings/language", loggedIn)));

    expect(result.locale).toBe("en");
    expect(result.timeZone).toBe("Asia/Seoul");
    expect(result.timeZones).toContain("America/New_York");
  });

  it("언어를 정하지 않은 회원은 지금 화면 언어, 시간대가 비면 Asia/Seoul", async () => {
    mockBackend({ "GET /api/v1/me": ok({ ...me, locale: null, timeZone: "" }) });

    const result = await loader(
      routeArgs<LoaderArgs>(
        getRequest("/settings/language", { ...loggedIn, "accept-language": "ja" }),
      ),
    );

    expect(result).toMatchObject({ locale: "ja", timeZone: "Asia/Seoul" });
  });
});

describe("action", () => {
  it("PATCH /me로 언어·시간대를 저장하고 쿠키 lang도 바꾼다", async () => {
    const backend = mockBackend({ "GET /api/v1/me": ok(me), "PATCH /api/v1/me": ok(me) });
    const request = formRequest(
      "/settings/language",
      { locale: "ja", timeZone: "America/New_York" },
      loggedIn,
    );

    const result = asData(await action(routeArgs<ActionArgs>(request)));

    expect(result.data).toEqual({ ok: true });
    expect(backend.callsTo("PATCH /api/v1/me")[0].body).toEqual({
      locale: "ja",
      timeZone: "America/New_York",
    });
    expect(responseCookies(request)).toContainEqual(expect.stringMatching(/^lang=ja; Path=\/;/));
  });

  it("빈 값은 backend를 부르지 않고 REQUIRED", async () => {
    const backend = mockBackend({ "GET /api/v1/me": ok(me) });

    const result = asData(
      await action(
        routeArgs<ActionArgs>(
          formRequest("/settings/language", { locale: "", timeZone: " " }, loggedIn),
        ),
      ),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({
      ok: false,
      fieldErrors: [
        { field: "locale", code: "REQUIRED" },
        { field: "timeZone", code: "REQUIRED" },
      ],
    });
    expect(backend.callsTo("PATCH /api/v1/me")).toEqual([]);
  });

  it("backend 검증 오류(잘못된 시간대)는 그 입력란 오류", async () => {
    mockBackend({
      "GET /api/v1/me": ok(me),
      "PATCH /api/v1/me": fail(400, "VALIDATION_FAILED", [{ field: "timeZone", code: "INVALID" }]),
    });
    const request = formRequest(
      "/settings/language",
      { locale: "en", timeZone: "Mars/Base" },
      loggedIn,
    );

    const result = asData(await action(routeArgs<ActionArgs>(request)));

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({ ok: false, resultCode: "VALIDATION_FAILED" });
    expect(responseCookies(request).some((cookie) => cookie.startsWith("lang="))).toBe(false);
  });
});

describe("meta", () => {
  it("noindex, 화면 언어 제목", () => {
    expect(meta({ matches: [{ id: "root", loaderData: rootData("en") }] } as never)).toEqual([
      { title: "Language and time zone - Blog" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("화면", () => {
  function renderPage(routes: Parameters<typeof mockBackend>[0], language: "ko" | "en" = "en") {
    const backend = mockBackend({ "GET /api/v1/me": ok(me), ...routes });
    renderRoutes(
      [
        {
          path: "settings/language",
          loader: withCookie(loader),
          action: withCookie(action),
          Component: SettingsLanguage,
        },
      ],
      { initialEntries: ["/settings/language"], language },
    );
    return backend;
  }

  it("언어 4개(각 언어 이름)와 IANA 시간대 목록, 지금 값이 선택되어 있다", async () => {
    renderPage({});

    const language = await screen.findByLabelText("Display language");
    expect(language).toHaveValue("en");
    expect(
      [...(language as HTMLSelectElement).options].map((option) => [option.value, option.text]),
    ).toEqual([
      ["ko", "한국어"],
      ["en", "English"],
      ["ja", "日本語"],
      ["zh-CN", "简体中文"],
    ]);
    const timeZone = screen.getByLabelText("Time zone");
    expect(timeZone).toHaveValue("Asia/Seoul");
    expect(screen.getByRole("option", { name: "America/New_York" })).toBeInTheDocument();
  });

  it("저장하면 안내를 보여준다", async () => {
    let current = me;
    const backend = renderPage({
      "GET /api/v1/me": () => ok(current),
      "PATCH /api/v1/me": (call) => {
        current = { ...me, ...(call.body as object) };
        return ok(current);
      },
    });

    fireEvent.change(await screen.findByLabelText("Time zone"), {
      target: { value: "America/New_York" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your language and time zone have been saved.",
    );
    expect(backend.callsTo("PATCH /api/v1/me")[0].body).toEqual({
      locale: "en",
      timeZone: "America/New_York",
    });
    expect(screen.getByLabelText("Time zone")).toHaveValue("America/New_York");
  });

  it("오류 문구를 화면 언어로 보여준다", async () => {
    renderPage(
      {
        "PATCH /api/v1/me": fail(400, "VALIDATION_FAILED", [
          { field: "timeZone", code: "INVALID" },
        ]),
      },
      "ko",
    );

    fireEvent.click(await screen.findByRole("button", { name: "저장" }));

    expect(await screen.findByText("입력한 내용을 확인해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("올바르지 않은 값입니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("시간대")).toHaveAttribute("aria-invalid", "true");
  });
});
