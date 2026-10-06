// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it, vi } from "vitest";

import { publicOrigin } from "~/config.server";
import { PublishSettingsDialog } from "~/components/post/PublishSettingsDialog";
import { formatDate, formatDateTime } from "~/i18n/format";
import { absoluteUrl, pageMeta } from "~/seo/meta";

import { testI18n } from "../support/render";

describe("PublishSettingsDialog", () => {
  function renderDialog(pending = false) {
    const onClose = vi.fn();
    const onPublish = vi.fn();
    render(
      <I18nextProvider i18n={testI18n("ja")}>
        <PublishSettingsDialog
          published={false}
          initial={{ visibility: "PUBLIC", commentEnabled: true }}
          pending={pending}
          onClose={onClose}
          onPublish={onPublish}
        />
      </I18nextProvider>,
    );
    return { onClose, onPublish };
  }

  it("Esc로 닫는다", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("발행 중에는 닫지 않고 버튼을 막는다", () => {
    const { onClose } = renderDialog(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "公開する" })).toBeDisabled();
    expect(screen.getByText("公開しています。")).toBeInTheDocument();
  });

  it("공개 범위를 다시 공개로 바꾸고 발행", () => {
    const { onPublish } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: "非公開(自分のみ)" }));
    fireEvent.click(screen.getByRole("radio", { name: "公開" }));
    fireEvent.click(screen.getByRole("button", { name: "公開する" }));
    expect(onPublish).toHaveBeenCalledWith({ visibility: "PUBLIC", commentEnabled: true });
  });
});

describe("seo meta", () => {
  it("사이트 이름과 noindex", () => {
    expect(pageMeta({ title: "t", siteName: "블로그", noindex: true })).toEqual([
      { title: "t" },
      { property: "og:title", content: "t" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "블로그" },
      { name: "robots", content: "noindex" },
    ]);
  });

  it("absoluteUrl", () => {
    expect(absoluteUrl("https://blog.java21.net", "/media/a")).toBe(
      "https://blog.java21.net/media/a",
    );
    expect(absoluteUrl("https://blog.java21.net", "https://cdn.example/x")).toBe(
      "https://cdn.example/x",
    );
    expect(absoluteUrl("https://blog.java21.net", null)).toBeNull();
    expect(absoluteUrl("not a url", "/x")).toBeNull();
  });
});

describe("publicOrigin", () => {
  const request = new Request("http://internal:5173/marco/1");

  it("BLOG_PUBLIC_URL이 있으면 그 출처, 없거나 잘못되면 요청 출처", () => {
    expect(publicOrigin(request, { BLOG_PUBLIC_URL: "https://blog.java21.net/x" })).toBe(
      "https://blog.java21.net",
    );
    expect(publicOrigin(request, {})).toBe("http://internal:5173");
    expect(publicOrigin(request, { BLOG_PUBLIC_URL: "nope" })).toBe("http://internal:5173");
  });
});

describe("날짜 형식", () => {
  it("화면 언어와 시간대로 쓰고, 잘못된 시간대는 Asia/Seoul", () => {
    const iso = "2026-10-06T16:00:00Z";
    expect(formatDate(iso, "ko", "Asia/Seoul")).toBe("2026. 10. 7.");
    expect(formatDate(iso, "en", "America/New_York")).toBe("Oct 6, 2026");
    expect(formatDate(iso, "ko", "Not/AZone")).toBe("2026. 10. 7.");
    expect(formatDateTime(iso, "en", "UTC")).toBe("Oct 6, 2026, 4:00 PM");
  });

  it("값이 없거나 날짜가 아니면 빈 문자열", () => {
    expect(formatDate(null, "ko", "Asia/Seoul")).toBe("");
    expect(formatDate("not-a-date", "ko", "Asia/Seoul")).toBe("");
  });
});
