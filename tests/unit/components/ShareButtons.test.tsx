// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  facebookShareUrl,
  ShareButtons,
  type ShareButtonsProps,
  xShareUrl,
} from "~/components/post/ShareButtons";
import { shareToKakao } from "~/share/kakao.client";

import { testI18n } from "../support/render";

vi.mock("~/share/kakao.client", () => ({ shareToKakao: vi.fn() }));

const shareToKakaoMock = vi.mocked(shareToKakao);

const URL_ = "https://blog.java21.net/marco/123";
const props: ShareButtonsProps = {
  url: URL_,
  title: "JPA N+1 & 정리",
  summary: "요약",
  imageUrl: "https://blog.java21.net/media/k3Jd9fQ2xLmA7pZ0bR5tYw/1200x630",
  kakaoJsKey: null,
};

function renderShare(overrides: Partial<ShareButtonsProps> = {}) {
  return render(
    <I18nextProvider i18n={testI18n("ko")}>
      <ShareButtons {...props} {...overrides} />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  shareToKakaoMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 공유(T075, 002 FR-069) */
describe("ShareButtons", () => {
  it("X·페이스북: 주소·제목을 인코딩한 새 창 링크", () => {
    renderShare();

    const region = screen.getByRole("region", { name: "공유하기" });
    const x = within(region).getByRole("link", { name: "X" });
    expect(x).toHaveAttribute(
      "href",
      "https://x.com/intent/tweet?url=https%3A%2F%2Fblog.java21.net%2Fmarco%2F123&text=JPA+N%2B1+%26+%EC%A0%95%EB%A6%AC",
    );
    expect(x).toHaveAttribute("target", "_blank");
    expect(x).toHaveAttribute("rel", "noopener noreferrer");
    const facebook = within(region).getByRole("link", { name: "페이스북" });
    expect(facebook).toHaveAttribute(
      "href",
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fblog.java21.net%2Fmarco%2F123",
    );
    expect(facebook).toHaveAttribute("target", "_blank");
    expect(facebook).toHaveAttribute("rel", "noopener noreferrer");
    expect(xShareUrl("a", "b")).toBe("https://x.com/intent/tweet?url=a&text=b");
    expect(facebookShareUrl("a b")).toBe("https://www.facebook.com/sharer/sharer.php?u=a+b");
  });

  it("JS 없이(서버 렌더링) 그리면 복사 버튼 대신 주소 입력란, 카카오톡 버튼 없음", () => {
    const html = renderToString(
      <I18nextProvider i18n={testI18n("ko")}>
        <ShareButtons {...props} kakaoJsKey="kakao-key" />
      </I18nextProvider>,
    );
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(within(container).queryByRole("button", { name: "주소 복사" })).toBeNull();
    expect(within(container).queryByRole("button", { name: "카카오톡" })).toBeNull();
    expect(within(container).getByRole("textbox", { name: "글 주소" })).toHaveValue(URL_);
    expect(within(container).getByRole("link", { name: "X" })).toHaveAttribute("target", "_blank");
  });

  it("주소 복사는 Clipboard API로 하고 알린다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderShare();

    expect(screen.queryByRole("textbox", { name: "글 주소" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "주소 복사" }));

    expect(await screen.findByRole("status")).toHaveTextContent("주소를 복사했습니다.");
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it("복사에 실패하면 주소 입력란과 안내", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    renderShare();

    fireEvent.click(await screen.findByRole("button", { name: "주소 복사" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "주소를 복사하지 못했습니다. 아래 주소를 직접 복사해 주세요.",
    );
    const input = screen.getByRole("textbox", { name: "글 주소" });
    expect(input).toHaveValue(URL_);
    expect(input).toHaveAttribute("readonly");
    fireEvent.focus(input);
  });

  it("키가 없으면 카카오톡 버튼이 없다", async () => {
    renderShare({ kakaoJsKey: null });

    await screen.findByRole("button", { name: "주소 복사" });
    expect(screen.queryByRole("button", { name: "카카오톡" })).toBeNull();
  });

  it("키가 있으면 카카오톡 버튼이 제목·요약·대표 이미지·주소로 공유한다", async () => {
    shareToKakaoMock.mockResolvedValue(undefined);
    renderShare({ kakaoJsKey: "kakao-key" });

    fireEvent.click(await screen.findByRole("button", { name: "카카오톡" }));

    await waitFor(() =>
      expect(shareToKakaoMock).toHaveBeenCalledWith("kakao-key", {
        title: props.title,
        description: "요약",
        imageUrl: props.imageUrl,
        url: URL_,
      }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("카카오 SDK를 불러오지 못하면 오류 문구", async () => {
    shareToKakaoMock.mockRejectedValue(new Error("load failed"));
    renderShare({ kakaoJsKey: "kakao-key" });

    fireEvent.click(await screen.findByRole("button", { name: "카카오톡" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "카카오톡 공유를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  });
});
