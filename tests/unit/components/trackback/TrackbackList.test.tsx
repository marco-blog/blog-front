// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Trackback } from "~/api/models";
import { TrackbackList, isWebUrl } from "~/components/trackback/TrackbackList";
import { TrackbackSection } from "~/components/trackback/TrackbackSection";

import { renderRoutes } from "../../support/render";

const trackback = (id: number, overrides: Partial<Trackback> = {}): Trackback => ({
  id,
  title: `받은 글 ${id}`,
  excerpt: `요약 ${id}`,
  blogName: "다른 블로그",
  url: `https://other.example/${id}`,
  receivedAt: "2026-10-06T05:00:00Z",
  internal: false,
  ...overrides,
});
const hrefFor = (page: number) => `/marco/123?tbPage=${page}#trackbacks`;

function renderList(props: Partial<Parameters<typeof TrackbackList>[0]> = {}) {
  return renderRoutes([
    {
      path: "",
      Component: () => (
        <TrackbackList
          trackbacks={[trackback(2), trackback(1)]}
          totalCount={2}
          page={1}
          pageSize={10}
          hrefFor={hrefFor}
          {...props}
        />
      ),
    },
  ]);
}

describe("TrackbackList(005 T093)", () => {
  it("제목 링크(rel nofollow ugc noopener)·요약·블로그 이름·시각, 앵커 trackback-{id}", async () => {
    renderList();

    const list = await screen.findByRole("list", { name: "받은 트랙백" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("id", "trackback-2");
    const link = within(items[0]).getByRole("link", { name: "받은 글 2" });
    expect(link).toHaveAttribute("href", "https://other.example/2");
    expect(link).toHaveAttribute("rel", "nofollow ugc noopener");
    expect(items[0]).toHaveTextContent("요약 2");
    expect(items[0]).toHaveTextContent("다른 블로그");
    expect(within(items[0]).getByText(/2026/)).toHaveAttribute("datetime", "2026-10-06T05:00:00Z");
  });

  it("http(s)가 아닌 주소는 텍스트, <script> 제목도 텍스트로", async () => {
    renderList({
      trackbacks: [
        trackback(3, { url: "javascript:alert(1)", title: "<script>alert(1)</script>" }),
      ],
      totalCount: 1,
    });

    const item = (await screen.findAllByRole("listitem"))[0];
    expect(within(item).queryByRole("link")).toBeNull();
    expect(item).toHaveTextContent("<script>alert(1)</script>");
    expect(document.querySelector("script")).toBeNull();
  });

  it("요약·블로그 이름이 없으면 그 줄을 비운다", async () => {
    renderList({ trackbacks: [trackback(4, { excerpt: null, blogName: null })], totalCount: 1 });
    const item = (await screen.findAllByRole("listitem"))[0];
    expect(item.querySelector(".trackback-excerpt")).toBeNull();
  });

  it("다음 쪽이 있으면 더 보기, 2쪽부터는 최근 트랙백 링크", async () => {
    renderList({ totalCount: 25, page: 2 });

    const nav = await screen.findByRole("navigation", { name: "트랙백 쪽 이동" });
    expect(within(nav).getByRole("link", { name: "더 보기" })).toHaveAttribute(
      "href",
      "/marco/123?tbPage=3#trackbacks",
    );
    expect(within(nav).getByRole("link", { name: "최근 트랙백" })).toHaveAttribute(
      "href",
      "/marco/123?tbPage=1#trackbacks",
    );
  });

  it("한 쪽뿐이면 쪽 이동 없음, 비었으면 안내", async () => {
    renderList();
    await screen.findByRole("list", { name: "받은 트랙백" });
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("빈 목록", async () => {
    renderList({ trackbacks: [], totalCount: 0 });
    expect(await screen.findByText("받은 트랙백이 없습니다.")).toBeInTheDocument();
  });

  it("reportable이면 각 트랙백에 신고 버튼", async () => {
    renderList({ reportable: true });
    const items = await screen.findAllByRole("listitem");
    expect(within(items[0]).getByText("신고")).toBeInTheDocument();
  });

  it("isWebUrl", () => {
    expect(isWebUrl("https://a.example/")).toBe(true);
    expect(isWebUrl("http://a.example/")).toBe(true);
    expect(isWebUrl("ftp://a.example/")).toBe(false);
    expect(isWebUrl("not a url")).toBe(false);
  });
});

describe("TrackbackSection", () => {
  it("제목에 수, 주소 상자와 목록. 목록을 못 읽으면 안내", async () => {
    renderRoutes([
      {
        path: "",
        Component: () => (
          <TrackbackSection
            trackbackUrl="https://blog.java21.net/marco/123/trackback"
            trackbacks={null}
            totalCount={0}
            page={1}
            pageSize={10}
            hrefFor={hrefFor}
          />
        ),
      },
    ]);

    expect(await screen.findByRole("heading", { name: "트랙백 0" })).toBeInTheDocument();
    expect(screen.getByLabelText("트랙백 주소")).toBeInTheDocument();
    expect(screen.getByText("트랙백 목록을 불러오지 못했습니다.")).toBeInTheDocument();
  });
});
