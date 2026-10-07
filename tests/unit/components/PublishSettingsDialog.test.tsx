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
