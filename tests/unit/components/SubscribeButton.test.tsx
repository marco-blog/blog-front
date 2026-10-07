// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SubscribeButton, type SubscribeButtonProps } from "~/components/blog/SubscribeButton";
import type { SubscribeActionData } from "~/discovery/actions";

import { renderRoutes } from "../support/render";

/** 구독 버튼(T026, 002 FR-031) */
describe("SubscribeButton", () => {
  function renderButton(
    props: Partial<SubscribeButtonProps> = {},
    action?: (form: FormData) => SubscribeActionData,
  ) {
    const submitted: FormData[] = [];
    renderRoutes(
      [
        {
          path: "marco",
          Component: () => (
            <SubscribeButton
              subscribed={false}
              subscriberCount={3}
              isOwnBlog={false}
              loginHref={null}
              {...props}
            />
          ),
          action: async ({ request }) => {
            const form = await request.formData();
            submitted.push(form);
            return action?.(form) ?? null;
          },
        },
      ],
      { initialEntries: ["/marco"] },
    );
    return submitted;
  }

  it("구독자 수와 구독 버튼(intent=subscribe)", async () => {
    renderButton();

    const button = await screen.findByRole("button", { name: "구독" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.closest("form")!.querySelector('input[name="intent"]')).toHaveValue("subscribe");
    expect(screen.getByText("구독자 3명")).toBeInTheDocument();
  });

  it("구독 → 구독 중(취소)으로 바뀌고 수가 는다", async () => {
    const submitted = renderButton({}, (form) => ({
      intent: form.get("intent") as "subscribe",
      ok: true,
      subscribed: true,
      subscriberCount: 4,
    }));

    fireEvent.click(await screen.findByRole("button", { name: "구독" }));

    const button = await screen.findByRole("button", { name: "구독 중 (취소)" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.closest("form")!.querySelector('input[name="intent"]')).toHaveValue(
      "unsubscribe",
    );
    expect(screen.getByText("구독자 4명")).toBeInTheDocument();
    expect(Object.fromEntries(submitted[0])).toEqual({ intent: "subscribe" });
  });

  it("오류 코드는 문구로(CANNOT_SUBSCRIBE_OWN_BLOG)", async () => {
    renderButton({
      result: { intent: "subscribe", ok: false, resultCode: "CANNOT_SUBSCRIBE_OWN_BLOG" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("내 블로그는 구독할 수 없습니다.");
  });

  it("차단된 회원(FORBIDDEN)은 차단을 말하지 않는 일반 문구", async () => {
    renderButton({ result: { intent: "subscribe", ok: false, resultCode: "FORBIDDEN" } });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("이 작업을 할 권한이 없습니다.");
    expect(alert).not.toHaveTextContent("차단");
  });

  it("비로그인은 로그인 링크", async () => {
    renderButton({ loginHref: "/login?next=%2Fmarco" });

    expect(await screen.findByRole("link", { name: "로그인하고 구독하기" })).toHaveAttribute(
      "href",
      "/login?next=%2Fmarco",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("내 블로그면 버튼 없이 구독자 수만", async () => {
    renderButton({ isOwnBlog: true, subscriberCount: 12 });

    expect(await screen.findByText("구독자 12명")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
