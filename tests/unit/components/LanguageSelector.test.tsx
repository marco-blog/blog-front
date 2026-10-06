// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Footer } from "~/components/layout/Footer";
import { LanguageSelector } from "~/components/layout/LanguageSelector";
import { languageCookie } from "~/i18n/languageCookie.server";

import { renderRoutes } from "../support/render";

/**
 * 하단 언어 선택(T228, FR-150): `/locale`로 보내는 일반 폼이라 JS 없이도 동작하고, 지금 주소를 함께 보내 같은 페이지로 돌아온다.
 * 언어 이름은 각 언어의 자기 이름이다.
 */
describe("LanguageSelector", () => {
  it("POST /locale 폼: 지금 언어가 선택되어 있고, 지금 주소(검색어 포함)를 함께 보낸다", async () => {
    renderRoutes([{ path: "marco/12", Component: LanguageSelector }], {
      language: "ja",
      initialEntries: ["/marco/12?page=2"],
    });

    const select = await screen.findByLabelText("言語");
    const form = select.closest("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/locale");
    expect(select).toHaveAttribute("name", "lang");
    expect(select).toHaveValue("ja");
    expect(form.querySelector('input[name="redirectTo"]')).toHaveValue("/marco/12?page=2");
    expect(
      [...(select as HTMLSelectElement).options].map((option) => [
        option.value,
        option.text,
        option.lang,
      ]),
    ).toEqual([
      ["ko", "한국어", "ko"],
      ["en", "English", "en"],
      ["ja", "日本語", "ja"],
      ["zh-CN", "简体中文", "zh-CN"],
    ]);
    expect(within(form).getByRole("button", { name: "変更" })).toHaveAttribute("type", "submit");
  });

  it("JS가 있으면 고르자마자 /locale로 보낸다", async () => {
    let submitted: FormData | null = null;
    renderRoutes(
      [
        { path: "marco", Component: LanguageSelector },
        {
          path: "locale",
          action: async ({ request }) => {
            submitted = await request.formData();
            return new Response(null, { status: 302, headers: { Location: "/marco" } });
          },
        },
      ],
      { language: "ko", initialEntries: ["/marco"] },
    );

    fireEvent.change(await screen.findByLabelText("언어"), { target: { value: "en" } });

    await waitFor(() => expect(submitted).not.toBeNull());
    expect(Object.fromEntries(submitted!)).toEqual({ lang: "en", redirectTo: "/marco" });
  });

  it("하단에 약관 링크와 함께 있다", async () => {
    renderRoutes([{ index: true, Component: Footer }], { language: "zh-CN" });

    const footer = await screen.findByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "服务条款" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(within(footer).getByLabelText("语言")).toHaveValue("zh-CN");
    expect(within(footer).getByRole("button", { name: "切换" })).toBeInTheDocument();
  });

  it("쿠키 값은 언어 코드 그대로(1년)", () => {
    expect(languageCookie("zh-CN", false)).toBe(
      "lang=zh-CN; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax",
    );
  });
});
