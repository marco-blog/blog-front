// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { PublishSettingsDialog } from "~/components/post/PublishSettingsDialog";

import { testI18n } from "../support/render";

function renderDialog(notice?: boolean) {
  const onPublish = vi.fn();
  render(
    <I18nextProvider i18n={testI18n("ko")}>
      <PublishSettingsDialog
        published={false}
        initial={{ visibility: "PUBLIC", commentEnabled: true, categoryId: null, tags: [], notice }}
        onClose={vi.fn()}
        onPublish={onPublish}
      />
    </I18nextProvider>,
  );
  return onPublish;
}

describe("발행 설정: 공지로 등록(004 FR-059)", () => {
  it("기본은 꺼져 있고, 체크하면 notice: true로 발행", () => {
    const onPublish = renderDialog();
    const notice = screen.getByLabelText("공지로 등록");
    expect(notice).not.toBeChecked();

    fireEvent.click(notice);
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ notice: true }));
  });

  it("이미 공지인 글은 체크된 채 열리고, 해제하면 notice: false", () => {
    const onPublish = renderDialog(true);
    const notice = screen.getByLabelText("공지로 등록");
    expect(notice).toBeChecked();

    fireEvent.click(notice);
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ notice: false }));
  });
});

type DialogProps = Parameters<typeof PublishSettingsDialog>[0];

function renderWith(
  props: Partial<Omit<DialogProps, "initial">> & { initial?: Partial<DialogProps["initial"]> } = {},
) {
  const onPublish = vi.fn();
  const { initial, ...rest } = props;
  render(
    <I18nextProvider i18n={testI18n("ko")}>
      <PublishSettingsDialog
        published={false}
        onClose={vi.fn()}
        onPublish={onPublish}
        {...rest}
        initial={{
          visibility: "PUBLIC",
          commentEnabled: true,
          categoryId: null,
          tags: [],
          ...initial,
        }}
      />
    </I18nextProvider>,
  );
  return onPublish;
}

describe("발행 설정: 보호 글(004 FR-062)", () => {
  it('"보호"를 고르면 비밀번호 칸이 생기고, 새로 보호하면 비밀번호가 필요하다', () => {
    const onPublish = renderWith();
    expect(screen.queryByLabelText("보호 글 비밀번호")).toBeNull();

    fireEvent.click(screen.getByLabelText("보호(비밀번호를 아는 사람만)"));
    const password = screen.getByLabelText("보호 글 비밀번호");
    expect(password).toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByText("필수 입력 항목입니다.")).toBeInTheDocument();

    fireEvent.change(password, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));
    expect(screen.getByText("4자 이상 입력해 주세요.")).toBeInTheDocument();

    fireEvent.change(password, { target: { value: "open-sesame" } });
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: "PROTECTED", password: "open-sesame" }),
    );
  });

  it("이미 보호 글이면 비워 두면 유지(비밀번호를 보내지 않음)", () => {
    const onPublish = renderWith({ published: true, initial: { visibility: "PROTECTED" } });
    expect(screen.getByText("바꾸지 않으려면 비워 두세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("보호 글 비밀번호")).not.toBeRequired();

    fireEvent.click(screen.getByRole("button", { name: "수정 발행" }));
    const value = onPublish.mock.calls[0][0];
    expect(value.visibility).toBe("PROTECTED");
    expect(value).not.toHaveProperty("password");
  });

  it("다른 공개 범위로 바꾸면 비밀번호를 보내지 않는다", () => {
    const onPublish = renderWith({ initial: { visibility: "PROTECTED" } });
    fireEvent.change(screen.getByLabelText("보호 글 비밀번호"), { target: { value: "secret1" } });
    fireEvent.click(screen.getByLabelText("공개"));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));
    expect(onPublish.mock.calls[0][0]).not.toHaveProperty("password");
  });
});

describe("발행 설정: 예약 발행(004 FR-064)", () => {
  it("발행된 글에는 예약 입력이 없다", () => {
    renderWith({ published: true });
    expect(screen.queryByLabelText("예약 발행")).toBeNull();
  });

  it("체크하고 회원 시간대로 입력하면 UTC로 보낸다(버튼은 예약 발행)", () => {
    const onPublish = renderWith({ timeZone: "America/New_York" });
    expect(screen.getByText("지금")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("예약 발행"));
    expect(screen.getByText("America/New_York 시간 기준입니다.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("발행할 날짜와 시각"), {
      target: { value: "2026-11-02T09:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "예약 발행" }));
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ scheduledAt: "2026-11-02T14:30:00Z" }),
    );
  });

  it("예약 글은 예약 시각이 채워진 채 열리고, 끄면 바로 발행(null)", () => {
    const onPublish = renderWith({
      timeZone: "Asia/Seoul",
      initial: { scheduledAt: "2026-10-08T00:00:00Z" },
    });
    expect(screen.getByLabelText("예약 발행")).toBeChecked();
    expect(screen.getByLabelText("발행할 날짜와 시각")).toHaveValue("2026-10-08T09:00");

    fireEvent.click(screen.getByLabelText("예약 발행"));
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: null }));
  });

  it("예약 시각을 비우면 보내지 않고 알린다", () => {
    const onPublish = renderWith();
    fireEvent.click(screen.getByLabelText("예약 발행"));
    fireEvent.click(screen.getByRole("button", { name: "예약 발행" }));
    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByText("올바르지 않은 값입니다.")).toBeInTheDocument();
  });
});

describe("발행 설정: 트랙백 보내기(005 T094)", () => {
  it("줄마다 주소(빈 줄·앞뒤 공백 제거, 같은 주소는 하나)를 trackbackUrls로", () => {
    const onPublish = renderWith();
    fireEvent.change(screen.getByLabelText("트랙백 보내기"), {
      target: { value: " https://a.example/tb \n\nhttps://b.example/tb\nhttps://a.example/tb\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        trackbackUrls: ["https://a.example/tb", "https://b.example/tb"],
      }),
    );
  });

  it("입력이 없으면 trackbackUrls를 보내지 않는다", () => {
    const onPublish = renderWith();
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));
    expect(onPublish.mock.calls[0][0]).not.toHaveProperty("trackbackUrls");
  });

  it("공개가 아니면 입력란이 꺼지고 안내, 써 둔 주소도 보내지 않는다", () => {
    const onPublish = renderWith();
    const field = screen.getByLabelText("트랙백 보내기");
    fireEvent.change(field, { target: { value: "https://a.example/tb" } });
    fireEvent.click(screen.getByRole("radio", { name: "비공개(나만 보기)" }));

    expect(field).toBeDisabled();
    expect(screen.getByText("공개 글에서만 트랙백을 보낼 수 있습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "비공개 저장" }));
    expect(onPublish.mock.calls[0][0]).not.toHaveProperty("trackbackUrls");
  });

  it("10개를 넘으면 보내지 않고 입력란에 알린다", () => {
    const onPublish = renderWith();
    const urls = Array.from({ length: 11 }, (_, i) => `https://a.example/${i}`).join("\n");
    fireEvent.change(screen.getByLabelText("트랙백 보내기"), { target: { value: urls } });
    fireEvent.click(screen.getByRole("button", { name: "공개 발행" }));

    expect(onPublish).not.toHaveBeenCalled();
    expect(screen.getByLabelText("트랙백 보내기")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("트랙백은 한 번에 10개까지 보낼 수 있습니다.")).toBeInTheDocument();
  });
});
