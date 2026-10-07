// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrackbackUrlBox } from "~/components/trackback/TrackbackUrlBox";

import { renderRoutes, testI18n } from "../../support/render";

const URL_VALUE = "https://blog.java21.net/marco/123/trackback";

function renderBox(url: string | null) {
  return renderRoutes([{ path: "", Component: () => <TrackbackUrlBox url={url} /> }]);
}

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

afterEach(() => {
  setClipboard(undefined);
  vi.restoreAllMocks();
});

describe("TrackbackUrlBox(005 T093)", () => {
  it("주소를 선택 가능한 읽기 전용 입력란에 보이고, 누르면 전체 선택", async () => {
    renderBox(URL_VALUE);

    const input = await screen.findByLabelText("트랙백 주소");
    expect(input).toHaveValue(URL_VALUE);
    expect(input).toHaveAttribute("readonly");
    const select = vi.spyOn(input as HTMLInputElement, "select");
    fireEvent.focus(input);
    expect(select).toHaveBeenCalled();
  });

  it("클립보드가 있으면 복사 버튼, 누르면 복사하고 안내", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    renderBox(URL_VALUE);

    const button = await screen.findByRole("button", { name: "복사" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(writeText).toHaveBeenCalledWith(URL_VALUE);
    expect(screen.getByRole("status")).toHaveTextContent("트랙백 주소를 복사했습니다.");
  });

  it("복사에 실패하면 안내하지 않는다", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    renderBox(URL_VALUE);

    const button = await screen.findByRole("button", { name: "복사" });
    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("클립보드가 없으면(서버 렌더링·JS 없음) 버튼 없이 입력란만", () => {
    const html = renderToString(
      <I18nextProvider i18n={testI18n()}>
        <TrackbackUrlBox url={URL_VALUE} />
      </I18nextProvider>,
    );
    expect(html).toContain(`value="${URL_VALUE}"`);
    expect(html).not.toContain("<button");
  });

  it("주소가 없으면 트랙백을 받지 않는 글", async () => {
    renderBox(null);
    expect(await screen.findByText("트랙백을 받지 않는 글입니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("트랙백 주소")).toBeNull();
  });
});
