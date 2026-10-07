// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RightsRequest, { action, loader, meta, prefillUrl } from "~/routes/rights-request";

import { metaArgs } from "../support/admin";
import { fail, mockBackend, ok } from "../support/backend";
import { renderRoutes } from "../support/render";
import {
  asData,
  expectRedirect,
  caught,
  formRequest,
  getRequest,
  routeArgs,
} from "../support/route";

type LoaderArgs = Parameters<typeof loader>[0];
type ActionArgs = Parameters<typeof action>[0];
const CONFIG = "GET /api/v1/captcha/config";
const RIGHTS = "POST /api/v1/rights-requests";

const valid = {
  targetUrl: "https://blog.java21.net/marco/1#comment-3",
  reason: "COPYRIGHT",
  rightsBasis: " 제가 찍은 사진입니다 ",
  contactEmail: " owner@example.com ",
  captchaToken: "e2e-pass",
};
const post = (fields: Record<string, string>) =>
  action(routeArgs<ActionArgs>(formRequest("/rights-request", fields)));

/** 권리 침해 신고(005 T044) */
describe("rights-request loader·action", () => {
  it("loader: CAPTCHA 설정, ?url=로 주소 미리 채움(같은 사이트 경로면 서비스 주소를 붙임), ?submitted=1", async () => {
    mockBackend({ [CONFIG]: ok({ provider: "test", siteKey: null }) });

    const result = await loader(
      routeArgs<LoaderArgs>(getRequest("/rights-request?url=%2Fmarco%2F1%23comment-3")),
    );
    expect(result).toMatchObject({
      captcha: { provider: "test", testToken: "e2e-pass" },
      targetUrl: "http://front.test/marco/1#comment-3",
      submitted: false,
    });
    expect(
      (await loader(routeArgs<LoaderArgs>(getRequest("/rights-request?submitted=1")))).submitted,
    ).toBe(true);
    expect(prefillUrl("https://other.example/a", "http://front.test")).toBe(
      "https://other.example/a",
    );
    expect(prefillUrl("//evil.example/a", "http://front.test")).toBe("");
    expect(prefillUrl("javascript:alert(1)", "http://front.test")).toBe("");
    expect(prefillUrl(null, "http://front.test")).toBe("");
  });

  it("action: 본문(targetUrl·reason·rightsBasis·contactEmail·captchaToken), 202면 ?submitted=1", async () => {
    const backend = mockBackend({ [RIGHTS]: ok(null, { status: 202 }) });

    expect(expectRedirect(await caught(post(valid)))).toBe("/rights-request?submitted=1");
    expect(backend.callsTo(RIGHTS)[0].body).toEqual({
      targetUrl: "https://blog.java21.net/marco/1#comment-3",
      reason: "COPYRIGHT",
      rightsBasis: "제가 찍은 사진입니다",
      contactEmail: "owner@example.com",
      captchaToken: "e2e-pass",
    });
  });

  it("입력 오류는 backend를 부르지 않고, CAPTCHA_FAILED·429는 폼 오류(입력 값 유지)", async () => {
    const backend = mockBackend({ [RIGHTS]: fail(400, "CAPTCHA_FAILED") });

    const invalid = asData(await post({ ...valid, contactEmail: "nope", reason: "SPAM" }));
    expect(invalid.init?.status).toBe(400);
    expect(invalid.data).toMatchObject({
      fieldErrors: [
        { field: "reason", code: "INVALID" },
        { field: "contactEmail", code: "INVALID_FORMAT" },
      ],
    });
    expect(backend.calls).toHaveLength(0);

    const captcha = asData(await post(valid));
    expect(captcha.init?.status).toBe(400);
    expect(captcha.data).toMatchObject({
      resultCode: "CAPTCHA_FAILED",
      values: { contactEmail: "owner@example.com" },
    });

    mockBackend({ [RIGHTS]: fail(429, "TOO_MANY_REQUESTS") });
    expect(asData(await post(valid)).data).toMatchObject({ resultCode: "TOO_MANY_REQUESTS" });
  });

  it("meta: 권리 침해 신고, noindex", () => {
    const tags = meta(metaArgs()) as Record<string, string>[];
    expect(tags).toContainEqual({ title: "권리 침해 신고 - 블로그" });
    expect(tags).toContainEqual({ name: "robots", content: "noindex" });
  });
});

describe("rights-request 화면", () => {
  function renderPage(initialEntry = "/rights-request?url=%2Fmarco%2F1") {
    const submitted: FormData[] = [];
    let respond: () => unknown = () => null;
    renderRoutes(
      [
        {
          path: "rights-request",
          loader: ({ request }) => ({
            captcha: { provider: "test", siteKey: null, testToken: "e2e-pass", nonce: null },
            targetUrl: new URL(request.url).searchParams.has("url")
              ? "http://front.test/marco/1"
              : "",
            submitted: new URL(request.url).searchParams.get("submitted") === "1",
          }),
          action: async ({ request }) => {
            submitted.push(await request.formData());
            return respond();
          },
          Component: RightsRequest,
        },
      ],
      { initialEntries: [initialEntry] },
    );
    return { submitted, setResponse: (fn: () => unknown) => (respond = fn) };
  }

  it("양식: 미리 채운 주소, 사유 4개, 권리 근거, 연락 이메일, 개인정보 안내(1년), 시험 모드 CAPTCHA", async () => {
    const { submitted, setResponse } = renderPage();

    const form = await screen.findByRole("form", { name: "권리 침해 신고" });
    expect(within(form).getByLabelText("신고할 주소")).toHaveValue("http://front.test/marco/1");
    expect(
      within(form)
        .getAllByRole("radio")
        .map((radio) => radio.getAttribute("value")),
    ).toEqual(["COPYRIGHT", "PRIVACY", "DEFAMATION", "OTHER"]);
    expect(within(form).getByText(/1년 동안 보관/)).toBeInTheDocument();
    expect(within(form).getByText(/시험 모드/)).toBeInTheDocument();

    setResponse(() => ({
      resultCode: "CAPTCHA_FAILED",
      field: null,
      fieldErrors: [],
      values: {
        targetUrl: "http://front.test/marco/1",
        reason: "PRIVACY",
        rightsBasis: "근거",
        contactEmail: "a@b.co",
      },
    }));
    fireEvent.click(within(form).getByRole("radio", { name: "개인정보 노출" }));
    fireEvent.change(within(form).getByLabelText("권리 근거"), { target: { value: "근거" } });
    fireEvent.change(within(form).getByLabelText("연락받을 이메일"), {
      target: { value: "a@b.co" },
    });
    fireEvent.click(within(form).getByRole("button", { name: "신고 접수" }));

    await waitFor(() => expect(submitted).toHaveLength(1));
    expect(submitted[0].get("captchaToken")).toBe("e2e-pass");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "자동 등록 방지 확인에 실패했습니다",
    );
    expect(screen.getByLabelText("연락받을 이메일")).toHaveValue("a@b.co");
  });

  it("?submitted=1이면 접수 안내만", async () => {
    renderPage("/rights-request?submitted=1");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "접수되었습니다. 처리 결과는 이메일로 안내합니다.",
    );
    expect(screen.queryByRole("form")).toBeNull();
  });
});
