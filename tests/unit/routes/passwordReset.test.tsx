// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PasswordReset, {
  action as requestAction,
  meta as requestMeta,
} from "~/routes/password-reset";
import PasswordResetConfirm, {
  action as confirmAction,
  loader as confirmLoader,
  meta as confirmMeta,
} from "~/routes/password-reset.confirm";

import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes, rootData } from "../support/render";
import { asData, formRequest, getRequest, routeArgs } from "../support/route";

type RequestActionArgs = Parameters<typeof requestAction>[0];
type ConfirmActionArgs = Parameters<typeof confirmAction>[0];
type ConfirmLoaderArgs = Parameters<typeof confirmLoader>[0];

const SENT = /입력한 이메일로 가입한 계정이 있으면/;

describe("/password-reset action", () => {
  it("이메일로 POST /auth/password-reset/request", async () => {
    const backend = mockBackend({
      "POST /api/v1/auth/password-reset/request": ok(null, { status: 202 }),
    });

    const result = asData(
      await requestAction(
        routeArgs<RequestActionArgs>(
          formRequest("/password-reset", { email: " marco@example.com " }),
        ),
      ),
    );

    expect(result.data).toEqual({ sent: true, email: "marco@example.com" });
    expect(backend.callsTo("POST /api/v1/auth/password-reset/request")[0].body).toEqual({
      email: "marco@example.com",
    });
  });

  it("빈 이메일은 backend를 부르지 않고 400", async () => {
    const backend = mockBackend({});

    const result = asData<{ fieldErrors: unknown[] }>(
      await requestAction(
        routeArgs<RequestActionArgs>(formRequest("/password-reset", { email: " " })),
      ),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.fieldErrors).toEqual([{ field: "email", code: "REQUIRED" }]);
    expect(backend.calls).toHaveLength(0);
  });

  it("형식 오류는 입력란 오류로", async () => {
    mockBackend({
      "POST /api/v1/auth/password-reset/request": fail(400, "VALIDATION_FAILED", [
        { field: "email", code: "INVALID_FORMAT" },
      ]),
    });

    const result = asData<{ sent: boolean }>(
      await requestAction(
        routeArgs<RequestActionArgs>(formRequest("/password-reset", { email: "nope" })),
      ),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.sent).toBe(false);
  });
});

describe("/password-reset 화면", () => {
  function renderPage() {
    renderRoutes([{ path: "password-reset", action: requestAction, Component: PasswordReset }], {
      initialEntries: ["/password-reset"],
    });
  }

  it("가입 여부와 관계없이 같은 안내", async () => {
    mockBackend({ "POST /api/v1/auth/password-reset/request": ok(null, { status: 202 }) });
    renderPage();

    expect(await screen.findByRole("heading", { name: "비밀번호 재설정" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("이메일"), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "재설정 링크 받기" }));

    expect(await screen.findByRole("status")).toHaveTextContent(SENT);
  });

  it("입력 형식 오류 문구", async () => {
    mockBackend({
      "POST /api/v1/auth/password-reset/request": fail(400, "VALIDATION_FAILED", [
        { field: "email", code: "INVALID_FORMAT" },
      ]),
    });
    renderPage();

    fireEvent.change(await screen.findByLabelText("이메일"), { target: { value: "nope@x" } });
    fireEvent.click(screen.getByRole("button", { name: "재설정 링크 받기" }));

    expect(await screen.findByText("형식이 올바르지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("meta는 noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("ja") }] } as unknown as Parameters<
      typeof requestMeta
    >[0];
    expect(requestMeta(args)).toEqual([
      { title: "パスワード再設定 - ブログ" },
      { name: "robots", content: "noindex" },
    ]);
  });
});

describe("/password-reset/confirm", () => {
  it("loader는 주소의 token을 넘긴다", () => {
    expect(
      confirmLoader(
        routeArgs<ConfirmLoaderArgs>(getRequest("/password-reset/confirm?token=abc_DEF-1")),
      ),
    ).toEqual({ token: "abc_DEF-1" });
    expect(
      confirmLoader(routeArgs<ConfirmLoaderArgs>(getRequest("/password-reset/confirm"))),
    ).toEqual({ token: "" });
  });

  it("action: token과 새 비밀번호로 POST /auth/password-reset/confirm", async () => {
    const backend = mockBackend({ "POST /api/v1/auth/password-reset/confirm": ok(null) });

    const result = asData(
      await confirmAction(
        routeArgs<ConfirmActionArgs>(
          formRequest("/password-reset/confirm", {
            token: "abc",
            newPassword: "newPassword1",
            newPasswordConfirm: "newPassword1",
          }),
        ),
      ),
    );

    expect(result.data).toEqual({ done: true });
    expect(backend.callsTo("POST /api/v1/auth/password-reset/confirm")[0].body).toEqual({
      token: "abc",
      newPassword: "newPassword1",
    });
  });

  it("action: 확인 입력이 다르면 backend를 부르지 않는다", async () => {
    const backend = mockBackend({});

    const result = asData<{ fieldErrors: unknown[] }>(
      await confirmAction(
        routeArgs<ConfirmActionArgs>(
          formRequest("/password-reset/confirm", {
            token: "abc",
            newPassword: "newPassword1",
            newPasswordConfirm: "newPassword2",
          }),
        ),
      ),
    );

    expect(result.init?.status).toBe(400);
    expect(result.data.fieldErrors).toEqual([
      { field: "newPasswordConfirm", code: "PASSWORD_CONFIRM_MISMATCH" },
    ]);
    expect(backend.calls).toHaveLength(0);
  });

  function renderConfirm(url: string) {
    renderRoutes(
      [
        {
          path: "password-reset/confirm",
          loader: confirmLoader,
          action: confirmAction,
          Component: PasswordResetConfirm,
        },
      ],
      { initialEntries: [url] },
    );
  }

  async function submit(password = "newPassword1", confirm = password) {
    fireEvent.change(await screen.findByLabelText("새 비밀번호"), {
      target: { value: password },
    });
    fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: confirm } });
    fireEvent.click(screen.getByRole("button", { name: "비밀번호 바꾸기" }));
  }

  it("만료·사용된 링크는 PASSWORD_RESET_TOKEN_INVALID 문구와 다시 요청 링크", async () => {
    mockBackend({
      "POST /api/v1/auth/password-reset/confirm": fail(400, "PASSWORD_RESET_TOKEN_INVALID"),
    });
    renderConfirm("/password-reset/confirm?token=used");

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.",
    );
    expect(screen.getByRole("link", { name: "재설정 링크 다시 받기" })).toHaveAttribute(
      "href",
      "/password-reset",
    );
  });

  it("비밀번호 규칙 위반 문구", async () => {
    mockBackend({
      "POST /api/v1/auth/password-reset/confirm": fail(400, "VALIDATION_FAILED", [
        { field: "newPassword", code: "PASSWORD_WEAK" },
      ]),
    });
    renderConfirm("/password-reset/confirm?token=t");

    await submit("weakweak1");

    expect(
      await screen.findByText("비밀번호는 8~64자이고 영문과 숫자를 모두 넣어야 합니다."),
    ).toBeInTheDocument();
  });

  it("확인 입력이 다르면 문구", async () => {
    mockBackend({});
    renderConfirm("/password-reset/confirm?token=t");

    await submit("newPassword1", "different1");

    expect(await screen.findByText("새 비밀번호가 서로 다릅니다.")).toBeInTheDocument();
  });

  it("성공하면 안내와 로그인 링크", async () => {
    mockBackend({ "POST /api/v1/auth/password-reset/confirm": ok(null) });
    renderConfirm("/password-reset/confirm?token=t");

    await submit();

    expect(await screen.findByRole("status")).toHaveTextContent("새 비밀번호로 바꿨습니다.");
    expect(screen.getByRole("link", { name: "로그인하기" })).toHaveAttribute("href", "/login");
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
  });

  it("token이 없으면 다시 요청 안내만", async () => {
    renderConfirm("/password-reset/confirm");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.",
    );
    expect(screen.queryByLabelText("새 비밀번호")).toBeNull();
    expect(screen.getByRole("link", { name: "재설정 링크 다시 받기" })).toBeInTheDocument();
  });

  it("meta는 noindex", () => {
    const args = { matches: [{ id: "root", loaderData: rootData("en") }] } as unknown as Parameters<
      typeof confirmMeta
    >[0];
    expect(confirmMeta(args)).toEqual([
      { title: "Set a new password - Blog" },
      { name: "robots", content: "noindex" },
    ]);
  });
});
