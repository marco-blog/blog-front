// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";

import { writerMode, guestFieldErrors, isOwnEntry } from "~/blog/guestAuthor";
import { GuestFields } from "~/components/comment/GuestFields";
import { GuestPasswordPrompt } from "~/components/comment/GuestPasswordPrompt";
import { SecretToggle } from "~/components/comment/SecretToggle";

import { testI18n } from "../support/render";

const withI18n = (ui: React.ReactNode, language: "ko" | "en" = "ko") =>
  render(<I18nextProvider i18n={testI18n(language)}>{ui}</I18nextProvider>);

describe("비회원 칸", () => {
  it("이름(30자)·비밀번호(4~64자, password) 칸과 안내", () => {
    withI18n(<GuestFields />);

    expect(screen.getByRole("group", { name: "비회원으로 쓰기" })).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveAttribute("maxLength", "30");
    const password = screen.getByLabelText("비밀번호");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("minLength", "4");
    expect(password).toHaveAttribute("maxLength", "64");
    expect(screen.getByText("4~64자. 나중에 고치거나 지울 때 필요합니다.")).toBeInTheDocument();
  });

  it("오류 문구를 칸에 붙인다", () => {
    withI18n(<GuestFields errors={{ guestName: "이름 오류", guestPassword: "비밀번호 오류" }} />);
    expect(screen.getByLabelText("이름")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("비밀번호 오류")).toBeInTheDocument();
  });

  it("영어 문구", () => {
    withI18n(<GuestFields />, "en");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("비밀글 체크와 비밀번호 확인 칸", () => {
    withI18n(
      <>
        <SecretToggle defaultChecked />
        <SecretToggle label="비밀 댓글" />
        <GuestPasswordPrompt error="틀림" />
      </>,
    );
    expect(screen.getByLabelText("비밀글 (블로그 주인과 나만 보기)")).toBeChecked();
    expect(screen.getByLabelText("비밀 댓글")).not.toBeChecked();
    expect(screen.getByLabelText("작성할 때 입력한 비밀번호")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("틀림")).toBeInTheDocument();
  });
});

describe("쓰는 사람 판단(guestAuthor)", () => {
  it("회원·비회원 허용·로그인 필요", () => {
    expect(writerMode({ userId: 1 }, false)).toBe("member");
    expect(writerMode(null, true)).toBe("guest");
    expect(writerMode(null, false)).toBe("login");
    expect(writerMode(undefined, undefined)).toBe("login");
  });

  it("본인 글은 회원 글만", () => {
    expect(isOwnEntry({ userId: 1, nickname: "a", profileImageUrl: null }, 1)).toBe(true);
    expect(
      isOwnEntry({ userId: null, nickname: "a", profileImageUrl: null, guest: true }, null),
    ).toBe(false);
    expect(isOwnEntry(null, 1)).toBe(false);
  });

  it("비회원 이름·비밀번호 검사", () => {
    expect(guestFieldErrors("이름", "1234")).toEqual([]);
    expect(guestFieldErrors(" ", "")).toEqual([
      { field: "guestName", code: "REQUIRED" },
      { field: "guestPassword", code: "REQUIRED" },
    ]);
  });
});
