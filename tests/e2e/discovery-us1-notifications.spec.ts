import { expect, test, type Page } from "@playwright/test";

import {
  callApi,
  logIn,
  logOut,
  newAccount,
  publishPost,
  requireBackend,
  signUp,
} from "./support/backend.js";

/**
 * 002 US1 알림 Independent Test(quickstart #10~13, T050): 다른 회원의 댓글 → 주인에게 배지·알림, 누르면 댓글 위치로 가고 읽음,
 * 주인 자신의 댓글은 알림 없음, 구독·취소·재구독은 알림 1건, 화면 언어 en의 문구(글 제목은 원문 그대로).
 * backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("002 US1 알림", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const a = newAccount("na");
  const b = newAccount("nb");
  const c = newAccount("nc");
  let postId = 0;

  function badge(page: Page) {
    return page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: /^알림/ })
      .locator(".badge");
  }

  test("C가 A의 글에 댓글을 쓰면 A에게 배지 1과 알림, 누르면 댓글 위치로 가고 읽음(quickstart #10)", async ({
    page,
  }) => {
    await signUp(page, a);
    postId = await publishPost(page.request, a.handle, {
      title: "알림 받을 글",
      contentMarkdown: "댓글을 기다립니다.",
    });
    // 주인 자신의 댓글·답글은 알림을 만들지 않는다(quickstart #11).
    const own = await callApi<{ id: number }>(page.request, "POST", `/posts/${postId}/comments`, {
      content: "주인 댓글",
    });
    expect(own.status).toBe(201);
    await logOut(page);

    await signUp(page, c);
    const comment = await callApi<{ id: number }>(
      page.request,
      "POST",
      `/posts/${postId}/comments`,
      { content: "C의 댓글", parentId: own.body.result.id },
    );
    expect(comment.status).toBe(201);
    await logOut(page);

    await logIn(page, a);
    await page.goto(`/${a.handle}`);
    await expect(badge(page)).toHaveText("1");
    await page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: /^알림/ })
      .click();
    await expect(page).toHaveURL(/\/notifications$/);
    const list = page.getByRole("list", { name: "알림 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    const item = list.getByRole("button", {
      name: `안 읽음 ${c.nickname}님이 「알림 받을 글」에 댓글을 남겼습니다.`,
    });
    await item.click();
    await expect(page).toHaveURL(
      new RegExp(`/${a.handle}/${postId}#comment-${comment.body.result.id}$`),
    );
    await expect(badge(page)).toHaveCount(0);
    await page.goto("/notifications");
    await expect(page.getByText("안 읽음")).toHaveCount(0);
  });

  test("B가 구독 → 취소 → 다시 구독해도 NEW_SUBSCRIBER 알림은 1건(quickstart #12)", async ({
    page,
  }) => {
    await signUp(page, b);
    for (const method of ["PUT", "DELETE", "PUT"] as const) {
      const response = await callApi(page.request, method, `/me/subscriptions/${a.handle}`);
      expect(response.status).toBe(200);
    }
    await logOut(page);

    await logIn(page, a);
    await page.goto("/notifications");
    const list = page.getByRole("list", { name: "알림 목록" });
    await expect(
      list.getByText(`${b.nickname}님이 ${a.nickname}의 블로그 블로그를 구독했습니다.`),
    ).toHaveCount(1);
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(badge(page)).toHaveText("1");

    await page.getByRole("button", { name: "모두 읽음으로 표시" }).click();
    await expect(page.getByText("안 읽음")).toHaveCount(0);
    await expect(badge(page)).toHaveCount(0);
  });

  test("화면 언어 en이면 알림 문구가 영어, 글 제목은 원문 그대로(quickstart #13)", async ({
    page,
  }) => {
    await logIn(page, a);
    const changed = await callApi(page.request, "PATCH", "/me", { locale: "en" });
    expect(changed.status).toBe(200);

    await page.goto("/notifications");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    const list = page.getByRole("list", { name: "Notification list" });
    await expect(list.getByText(`${c.nickname} commented on "알림 받을 글".`)).toBeVisible();
    await expect(
      list.getByText(`${b.nickname} subscribed to ${a.nickname}의 블로그.`),
    ).toBeVisible();
  });
});
