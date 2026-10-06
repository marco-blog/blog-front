// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RelatedPosts } from "~/components/post/RelatedPosts";

import { postSummary } from "../support/fixtures";
import { renderRoutes } from "../support/render";

/** 관련 글(T075, 002 FR-068) */
describe("RelatedPosts", () => {
  function renderRelated(posts: ReturnType<typeof postSummary>[], language: "ko" | "en" = "ko") {
    return renderRoutes(
      [
        {
          path: "marco/1",
          Component: () => (
            <>
              <p>본문</p>
              <RelatedPosts handle="marco" posts={posts} />
            </>
          ),
        },
      ],
      { initialEntries: ["/marco/1"], language },
    );
  }

  it("받은 순서대로 제목(같은 블로그의 글 링크)과 발행일", async () => {
    renderRelated([
      postSummary(7, { title: "Z 글" }),
      postSummary(5, { title: "W 글", publishedAt: null }),
    ]);

    const region = await screen.findByRole("region", { name: "관련 글" });
    const links = within(region).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Z 글", "/marco/7"],
      ["W 글", "/marco/5"],
    ]);
    expect(within(region).getByText("2026년 10월 6일")).toHaveAttribute(
      "dateTime",
      "2026-10-06T04:24:19Z",
    );
    expect(within(region).getAllByRole("listitem")[1].querySelector("time")).toBeNull();
  });

  it("번역된 제목", async () => {
    renderRelated([postSummary(7)], "en");
    expect(await screen.findByRole("heading", { name: "Related posts" })).toBeInTheDocument();
  });

  it("빈 배열이면 영역을 그리지 않는다", async () => {
    renderRelated([]);
    await screen.findByText("본문");
    expect(screen.queryByRole("region", { name: "관련 글" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "관련 글" })).toBeNull();
  });
});
