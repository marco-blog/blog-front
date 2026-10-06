// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LikeButton, type LikeButtonProps } from "~/components/post/LikeButton";
import type { LikeActionData } from "~/discovery/actions";

import { renderRoutes } from "../support/render";

/** 좋아요 버튼(T025, 002 FR-030) */
describe("LikeButton", () => {
  function renderButton(
    props: Partial<LikeButtonProps> = {},
    action?: (form: FormData) => LikeActionData,
    language: "ko" | "en" = "ko",
  ) {
    const submitted: FormData[] = [];
    renderRoutes(
      [
        {
          path: "marco/123",
          Component: () => <LikeButton liked={false} likeCount={5} loginHref={null} {...props} />,
          action: async ({ request }) => {
            const form = await request.formData();
            submitted.push(form);
            return action?.(form) ?? null;
          },
        },
      ],
      { initialEntries: ["/marco/123"], language },
    );
    return submitted;
  }

  it("좋아요 수와 눌림 상태, 로그인 회원은 intent=like 폼", async () => {
    renderButton();

    const button = await screen.findByRole("button", { name: "좋아요" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("좋아요 5")).toBeInTheDocument();
    const form = button.closest("form")!;
    expect(form).toHaveAttribute("method", "post");
    expect(form.querySelector('input[name="intent"]')).toHaveValue("like");
  });

  it("이미 누른 글은 intent=unlike(좋아요 취소)", async () => {
    renderButton({ liked: true, likeCount: 6 }, undefined, "en");

    const button = await screen.findByRole("button", { name: "Unlike" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.closest("form")!.querySelector('input[name="intent"]')).toHaveValue("unlike");
    expect(screen.getByText("Likes 6")).toBeInTheDocument();
  });

  it("누르면 fetcher로 보내고 응답의 수로 고친다", async () => {
    const submitted = renderButton({}, (form) => ({
      intent: form.get("intent") as "like",
      ok: true,
      liked: true,
      likeCount: 6,
    }));

    fireEvent.click(await screen.findByRole("button", { name: "좋아요" }));

    expect(await screen.findByRole("button", { name: "좋아요 취소" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("좋아요 6")).toBeInTheDocument();
    expect(Object.fromEntries(submitted[0])).toEqual({ intent: "like" });
  });

  it("실패하면 오류 문구(POST_NOT_FOUND)를 보여주고 수는 그대로", async () => {
    renderButton({}, () => ({ intent: "like", ok: false, resultCode: "POST_NOT_FOUND" }));

    fireEvent.click(await screen.findByRole("button", { name: "좋아요" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("글을 찾을 수 없습니다.");
    expect(screen.getByText("좋아요 5")).toBeInTheDocument();
  });

  it("JS 없이 보낸 결과(라우트 actionData)도 반영한다", async () => {
    renderButton({
      result: { intent: "unlike", ok: true, liked: false, likeCount: 4 },
      liked: true,
    });

    expect(await screen.findByRole("button", { name: "좋아요" })).toBeInTheDocument();
    expect(screen.getByText("좋아요 4")).toBeInTheDocument();
  });

  it("비로그인은 버튼 없이 수와 로그인 링크(/login?next=현재 경로)", async () => {
    renderButton({ loginHref: "/login?next=%2Fmarco%2F123" });

    const link = await screen.findByRole("link", { name: "로그인하고 좋아요 누르기" });
    expect(link).toHaveAttribute("href", "/login?next=%2Fmarco%2F123");
    expect(screen.getByText("좋아요 5")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("수 문구는 discovery 네임스페이스(en)", async () => {
    renderButton({ likeCount: 1234 }, undefined, "en");

    expect(await screen.findByText("Likes 1,234")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Like" })).toBeEnabled());
  });
});
