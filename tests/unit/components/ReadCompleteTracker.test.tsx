// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReadCompleteTracker } from "~/components/post/ReadCompleteTracker";

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

/** 테스트용 IntersectionObserver: 마지막으로 만든 감시자를 꺼내 보이게 한다. */
function installObserver() {
  const observers: Array<{ callback: Callback; disconnect: ReturnType<typeof vi.fn> }> = [];
  class FakeObserver {
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();
    readonly callback: Callback;
    constructor(callback: Callback) {
      this.callback = callback;
      observers.push(this);
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return {
    show: (visible = true) =>
      act(() => observers[observers.length - 1].callback([{ isIntersecting: visible }])),
    observers,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 끝까지 읽음 신호(003 T045, FR-086) */
describe("ReadCompleteTracker", () => {
  it("감시 요소가 보이면 POST /api/v1/posts/{id}/read-complete를 한 번만", async () => {
    const io = installObserver();
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(<ReadCompleteTracker postId={123} />);
    expect(container.querySelector(".read-complete-sentinel")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    io.show(false);
    expect(fetchMock).not.toHaveBeenCalled();

    io.show();
    io.show();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/posts/123/read-complete", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    expect(io.observers[0].disconnect).toHaveBeenCalled();
  });

  it("IntersectionObserver가 없으면 아무것도 하지 않는다", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ReadCompleteTracker postId={1} />);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("실패는 무시하고, 화면에서 빠지면 감시를 멈춘다", async () => {
    const io = installObserver();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const { unmount } = render(<ReadCompleteTracker postId={7} />);
    io.show();
    await Promise.resolve();
    unmount();

    expect(io.observers[0].disconnect).toHaveBeenCalled();
  });
});
