// @vitest-environment jsdom
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { responseCookies } from "~/api/backendCookies.server";
import Signup, { action, loader, meta } from "~/routes/signup";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import {
  asData,
  caught,
  expectRedirect,
  formRequest,
  getRequest,
  routeArgs,
  statusOf,
} from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
type MetaArgs = Parameters<typeof meta>[0];

const SIGNUP = "POST /api/v1/auth/signup";
const TERMS = "GET /api/v1/legal/terms";
const AVAILABILITY = "GET /api/v1/auth/handle-availability";
const CONFIG = "GET /api/v1/captcha/config";
const TEST_CAPTCHA = {
  provider: "test",
  siteKey: null,
  testToken: "e2e-pass",
  nonce: null,
} as const;
const terms = {
  version: "2026-10-06",
  lang: "ko",
  authoritativeLang: "ko",
  effectiveAt: "2026-10-06T00:00:00Z",
  contentHtml: "<p>약관</p>",
};

const validForm = {
  email: "marco@example.com",
  password: "secret123",
  nickname: "마르코",
  handle: "marco",
  agreeTerms: "on",
  agreePrivacy: "on",
  over14: "on",
  termsVersion: "2026-10-06",
  locale: "ko",
  timeZone: "Asia/Seoul",
  captchaToken: "e2e-pass",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("signup loader", () => {
  it("화면 언어의 약관 버전과 CAPTCHA 설정을 받아 둔다", async () => {
    const backend = mockBackend({
      [TERMS]: ok(terms),
      [CONFIG]: ok({ provider: "test", siteKey: null }),
    });

    const result = await loader(
      routeArgs<LoaderArgs>(getRequest("/signup", { "accept-language": "ja" })),
    );

    expect(result).toEqual({ termsVersion: "2026-10-06", captcha: TEST_CAPTCHA });
    expect(backend.callsTo(TERMS)[0].url.searchParams.get("lang")).toBe("ja");
  });

  it("CAPTCHA 설정을 받지 못하면 CAPTCHA 없이 그린다", async () => {
    mockBackend({ [TERMS]: ok(terms), [CONFIG]: fail(503, "INTERNAL_ERROR") });

    const result = await loader(routeArgs<LoaderArgs>(getRequest("/signup")));

    expect(result.captcha.provider).toBe("none");
  });

  it("약관을 받지 못하면 그 상태 코드로 오류 화면", async () => {
    mockBackend({ [TERMS]: fail(503, "INTERNAL_ERROR") });

    expect(statusOf(await caught(loader(routeArgs<LoaderArgs>(getRequest("/signup")))))).toBe(503);
  });
});

describe("signup action", () => {
  it("동의·약관 버전·언어·시간대를 함께 보내고, 성공하면 /{handle}로 이동하며 쿠키를 싣는다", async () => {
    const cookie = "access_token=a; Path=/; HttpOnly; Secure; SameSite=Lax";
    const backend = mockBackend({
      [SIGNUP]: ok(
        { userId: 7, handle: "marco" },
        { status: 201, headers: { "set-cookie": cookie } },
      ),
    });
    const request = formRequest("/signup", validForm);

    const result = await action(routeArgs<ActionArgs>(request));

    expect(expectRedirect(result)).toBe("/marco");
    expect(backend.calls[0].body).toEqual({
      email: "marco@example.com",
      password: "secret123",
      nickname: "마르코",
      handle: "marco",
      agreeTerms: true,
      agreePrivacy: true,
      over14: true,
      termsVersion: "2026-10-06",
      locale: "ko",
      timeZone: "Asia/Seoul",
      captchaToken: "e2e-pass",
    });
    expect(responseCookies(request)).toEqual([cookie]);
  });

  it("지원하지 않는 언어·빈 시간대는 보내지 않는다", async () => {
    const backend = mockBackend({ [SIGNUP]: ok({ userId: 7, handle: "marco" }, { status: 201 }) });

    await action(
      routeArgs<ActionArgs>(formRequest("/signup", { ...validForm, locale: "fr", timeZone: "" })),
    );

    expect(backend.calls[0].body).not.toHaveProperty("locale");
    expect(backend.calls[0].body).not.toHaveProperty("timeZone");
  });

  it("필수 입력·약관/개인정보/만 14세 체크가 없으면 backend를 부르지 않는다", async () => {
    const backend = mockBackend();

    const result = asData<{ resultCode: string; fieldErrors: { field: string; code: string }[] }>(
      await action(
        routeArgs<ActionArgs>(
          formRequest("/signup", {
            email: "",
            password: "",
            nickname: " ",
            handle: "",
            termsVersion: "v",
          }),
        ),
      ),
    );

    expect(backend.calls).toHaveLength(0);
    expect(result.init?.status).toBe(400);
    expect(result.data.resultCode).toBe("VALIDATION_FAILED");
    expect(result.data.fieldErrors.map((error) => error.field)).toEqual([
      "email",
      "password",
      "nickname",
      "handle",
      "agreeTerms",
      "agreePrivacy",
      "over14",
    ]);
  });

  it.each([
    ["EMAIL_TAKEN", 409, "email"],
    ["HANDLE_TAKEN", 409, "handle"],
    ["HANDLE_RESERVED", 422, "handle"],
    ["HANDLE_INVALID", 422, "handle"],
  ])("%s는 %s 입력란 오류", async (code, status, field) => {
    mockBackend({ [SIGNUP]: fail(status, code) });

    const result = asData<{ resultCode: string; field: string | null }>(
      await action(routeArgs<ActionArgs>(formRequest("/signup", validForm))),
    );

    expect(result.init?.status).toBe(status);
    expect(result.data).toMatchObject({ resultCode: code, field });
  });

  it("CAPTCHA_FAILED·429는 폼 오류로, 입력 값은 그대로", async () => {
    mockBackend({ [SIGNUP]: fail(400, "CAPTCHA_FAILED") });

    const result = asData<{ resultCode: string; field: string | null; values: unknown }>(
      await action(
        routeArgs<ActionArgs>(formRequest("/signup", { ...validForm, captchaToken: "" })),
      ),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data).toMatchObject({
      resultCode: "CAPTCHA_FAILED",
      field: null,
      values: { email: "marco@example.com", nickname: "마르코", handle: "marco" },
    });
  });
});

describe("signup 화면", () => {
  function renderSignup() {
    return renderRoutes(
      [
        {
          path: "signup",
          loader: () => ({ termsVersion: "2026-10-06", captcha: TEST_CAPTCHA }),
          action,
          Component: Signup,
        },
        { path: ":handle", Component: () => <p>blog home</p> },
      ],
      { initialEntries: ["/signup"] },
    );
  }

  async function fill(values: Partial<Record<string, string>> = {}) {
    const merged = {
      email: "marco@example.com",
      password: "secret123",
      nickname: "마르코",
      handle: "marco",
      ...values,
    };
    fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: merged.email } });
    fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: merged.password } });
    fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: merged.nickname } });
    fireEvent.change(screen.getByLabelText("블로그 주소"), { target: { value: merged.handle } });
    fireEvent.click(screen.getByLabelText("이용약관에 동의합니다(필수)"));
    fireEvent.click(screen.getByLabelText("개인정보 수집·이용에 동의합니다(필수)"));
    fireEvent.click(screen.getByLabelText("만 14세 이상입니다(필수)"));
  }

  it("필수 입력과 세 가지 체크는 required, 약관·개인정보처리방침 링크가 있다", async () => {
    mockBackend();
    renderSignup();

    for (const label of ["이메일", "비밀번호", "닉네임", "블로그 주소"]) {
      expect(await screen.findByLabelText(label)).toBeRequired();
    }
    for (const label of [
      "이용약관에 동의합니다(필수)",
      "개인정보 수집·이용에 동의합니다(필수)",
      "만 14세 이상입니다(필수)",
    ]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByRole("link", { name: "이용약관 보기" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "개인정보처리방침 보기" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    const form = screen.getByRole("button", { name: "가입하기" }).closest("form")!;
    expect(form.querySelector('input[name="termsVersion"]')).toHaveValue("2026-10-06");
    expect(form.querySelector('input[name="locale"]')).toHaveValue("ko");
  });

  it("브라우저 시간대를 함께 보낸다", async () => {
    mockBackend();
    renderSignup();

    const form = (await screen.findByRole("button", { name: "가입하기" })).closest("form")!;
    expect(form.querySelector('input[name="timeZone"]')).toHaveValue(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });

  it.each([
    [{ available: false, reason: "TAKEN" }, "이미 사용 중인 주소입니다."],
    [{ available: false, reason: "RESERVED" }, "사용할 수 없는 주소입니다."],
    [{ available: true }, "사용할 수 있는 주소입니다."],
  ])("블로그 주소 사용 가능 여부 %j", async (availability, message) => {
    const backend = mockBackend({ [AVAILABILITY]: ok(availability) });
    renderSignup();

    fireEvent.change(await screen.findByLabelText("블로그 주소"), { target: { value: "login" } });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(backend.callsTo(AVAILABILITY)[0].url.searchParams.get("handle")).toBe("login");
  });

  it("규칙에 맞지 않는 주소는 backend를 부르지 않고 INVALID 안내", async () => {
    const backend = mockBackend();
    renderSignup();

    fireEvent.change(await screen.findByLabelText("블로그 주소"), {
      target: { value: "Bad--Name" },
    });

    expect(
      await screen.findByText(/영문 소문자·숫자·하이픈 3~20자로 입력해 주세요/),
    ).toBeInTheDocument();
    expect(backend.callsTo(AVAILABILITY)).toHaveLength(0);
  });

  it("EMAIL_TAKEN은 이메일 입력란 아래에 보여준다", async () => {
    mockBackend({
      [SIGNUP]: fail(409, "EMAIL_TAKEN"),
      [AVAILABILITY]: ok({ available: true }),
    });
    renderSignup();

    await fill();
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    const message = await screen.findByText("이미 가입된 이메일입니다.");
    expect(screen.getByLabelText("이메일")).toHaveAccessibleDescription(message.textContent!);
    expect(screen.getByLabelText("이메일")).toHaveAttribute("aria-invalid", "true");
  });

  it("HANDLE_TAKEN은 블로그 주소 입력란 아래에 보여준다", async () => {
    mockBackend({ [SIGNUP]: fail(409, "HANDLE_TAKEN"), [AVAILABILITY]: ok({ available: true }) });
    renderSignup();

    await fill();
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    const handleField = screen.getByLabelText("블로그 주소");
    await vi.waitFor(() =>
      expect(handleField).toHaveAccessibleDescription(
        expect.stringContaining("이미 사용 중인 주소입니다."),
      ),
    );
  });

  it("fieldErrors(PASSWORD_WEAK 등)는 각 입력란 문구로", async () => {
    mockBackend({
      [SIGNUP]: fail(400, "VALIDATION_FAILED", [
        { field: "password", code: "PASSWORD_WEAK" },
        { field: "nickname", code: "TOO_LONG", params: { max: 30 } },
      ]),
      [AVAILABILITY]: ok({ available: true }),
    });
    renderSignup();

    await fill();
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(
      await screen.findByText("비밀번호는 8~64자이고 영문과 숫자를 모두 넣어야 합니다."),
    ).toBeInTheDocument();
    expect(screen.getByText("30자 이하로 입력해 주세요.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("입력한 내용을 확인해 주세요.");
  });

  it("TERMS_VERSION_OUTDATED는 화면 위 오류", async () => {
    mockBackend({
      [SIGNUP]: fail(422, "TERMS_VERSION_OUTDATED"),
      [AVAILABILITY]: ok({ available: true }),
    });
    renderSignup();

    await fill();
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("약관이 바뀌었습니다.");
  });

  it("성공하면 내 블로그 홈으로 이동한다", async () => {
    mockBackend({
      [SIGNUP]: ok({ userId: 7, handle: "marco" }, { status: 201 }),
      [AVAILABILITY]: ok({ available: true }),
    });
    renderSignup();

    await fill();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "가입하기" }));
    });

    expect(await screen.findByText("blog home")).toBeInTheDocument();
  });

  it("시험 모드 CAPTCHA와 숨은 captchaToken", async () => {
    mockBackend();
    renderSignup();

    const group = await screen.findByRole("group", { name: "자동 등록 방지" });
    expect(group).toHaveTextContent("시험 모드");
    expect(group.querySelector('input[name="captchaToken"]')).toHaveValue("e2e-pass");
  });

  it("닉네임·블로그 주소의 금칙어(BANNED_WORD)는 입력란 문구로", async () => {
    mockBackend({
      [SIGNUP]: fail(400, "VALIDATION_FAILED", [
        { field: "nickname", code: "BANNED_WORD" },
        { field: "handle", code: "BANNED_WORD" },
      ]),
      [AVAILABILITY]: ok({ available: true }),
    });
    renderSignup();

    await fill();
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    await vi.waitFor(() =>
      expect(screen.getAllByText("사용할 수 없는 단어가 있습니다.")).toHaveLength(2),
    );
    expect(screen.getByLabelText("닉네임")).toHaveAttribute("aria-invalid", "true");
  });

  it("429는 잠시 후 다시 시도 안내", async () => {
    mockBackend({
      [SIGNUP]: fail(429, "TOO_MANY_REQUESTS", [], { "retry-after": "60" }),
      [AVAILABILITY]: ok({ available: true }),
    });
    renderSignup();

    await fill();
    fireEvent.click(screen.getByRole("button", { name: "가입하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("요청이 너무 많습니다");
  });

  it("로그인 링크가 있다", async () => {
    mockBackend();
    renderSignup();

    const link = await screen.findByRole("link", { name: "로그인" });
    expect(within(link.parentElement!).getByText("이미 계정이 있나요?")).toBeInTheDocument();
  });
});

describe("signup meta", () => {
  it("noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("ko") }] } as unknown as MetaArgs;
    expect(meta(args)).toEqual(
      expect.arrayContaining([
        { title: "회원가입 - 블로그" },
        { name: "robots", content: "noindex" },
      ]),
    );
  });
});
