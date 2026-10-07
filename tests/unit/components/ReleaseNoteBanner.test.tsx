// @vitest-environment jsdom
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReleaseNoteBanner } from "~/components/layout/ReleaseNoteBanner";
import { ReleaseNoteCard } from "~/components/portal/ReleaseNoteCard";

import { renderRoutes } from "../support/render";

const note = { version: "1.3.0", title: "포털이 생겼습니다" };

/** 새 릴리스 노트 배너와 포털 카드(003 T115) */
describe("ReleaseNoteBanner", () => {
  function renderBanner(path = "/marco/12?page=2") {
    let seen: FormData | null = null;
    renderRoutes(
      [
        { path: "marco/12", Component: () => <ReleaseNoteBanner note={note} /> },
        { path: "updates/v1.3.0", Component: () => <ReleaseNoteBanner note={note} /> },
        {
          path: "updates/seen",
          action: async ({ request }: { request: Request }) => {
            seen = await request.formData();
            return { ok: true };
          },
        },
      ],
      { initialEntries: [path] },
    );
    return () => seen;
  }

  it("버전·제목·보기 링크, 닫기 폼은 /updates/seen에 version과 지금 주소(next)", async () => {
    renderBanner();

    const banner = await screen.findByRole("complementary", { name: "새 업데이트 소식" });
    expect(banner).toHaveTextContent("새 버전 v1.3.0: 포털이 생겼습니다");
    expect(within(banner).getByRole("link", { name: "보기" })).toHaveAttribute(
      "href",
      "/updates/v1.3.0",
    );
    const form = within(banner).getByRole("button", { name: "닫기" }).closest("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/updates/seen");
    expect(Object.fromEntries(new FormData(form))).toEqual({
      version: "1.3.0",
      next: "/marco/12?page=2",
    });
  });

  it("JS가 있으면 fetcher로 보내(js=1) 이동 없이 바로 숨긴다", async () => {
    const seen = renderBanner();

    fireEvent.click(await screen.findByRole("button", { name: "닫기" }));

    await vi.waitFor(() => expect(screen.queryByRole("complementary")).toBeNull());
    await vi.waitFor(() => expect(seen()).not.toBeNull());
    expect(Object.fromEntries(seen()!)).toEqual({
      version: "1.3.0",
      next: "/marco/12?page=2",
      js: "1",
    });
  });

  it("그 버전 화면에서는 보이지 않는다", async () => {
    renderBanner("/updates/v1.3.0");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("ReleaseNoteCard", () => {
  it("제목과 버전 페이지 링크", async () => {
    renderRoutes(
      [
        {
          index: true,
          Component: () => (
            <ReleaseNoteCard
              note={{
                version: "1.3.0",
                title: "포털",
                releaseDate: "2026-10-06",
                firstPublishedAt: "2026-10-06T00:00:00Z",
                lang: "ko",
              }}
            />
          ),
        },
      ],
      { language: "en" },
    );

    const card = await screen.findByRole("complementary", { name: "Updates" });
    expect(card).toHaveTextContent("포털");
    expect(within(card).getByRole("link")).toHaveAttribute("href", "/updates/v1.3.0");
  });
});
