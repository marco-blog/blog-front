import { expect, test } from "@playwright/test";

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
 * 002 US1 좋아요·구독·구독 피드 Independent Test(quickstart #1, #3, #5, #7, T030): A·B·C 가입, B가 A·C 구독 →
 * A·C 발행(A는 비공개 글도) → B의 /feed에 두 블로그의 공개 글만 최신순. 좋아요 누름·새로 고침·취소, 비로그인 로그인 링크,
 * A 화면에는 구독 버튼이 없다. backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("002 US1 좋아요·구독·구독 피드", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const a = newAccount("fa");
  const b = newAccount("fb");
  const c = newAccount("fc");
  let aPostPath = "";

  test("B가 A의 글에 좋아요 → 새로 고침해도 유지 → 취소(quickstart #1)", async ({ page }) => {
    await signUp(page, a);
    const postId = await publishPost(page.request, a.handle, {
      title: "좋아요 받을 글",
      contentMarkdown: "좋아요를 눌러 주세요.",
    });
    aPostPath = `/${a.handle}/${postId}`;
    await logOut(page);

    await signUp(page, b);
    await page.goto(aPostPath);
    await expect(page.getByText("좋아요 0")).toBeVisible();
    await page.getByRole("button", { name: "좋아요", exact: true }).click();
    await expect(page.getByRole("button", { name: "좋아요 취소" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText("좋아요 1")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "좋아요 취소" })).toBeVisible();
    await expect(page.getByText("좋아요 1")).toBeVisible();

    await page.getByRole("button", { name: "좋아요 취소" }).click();
    await expect(page.getByRole("button", { name: "좋아요", exact: true })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.getByText("좋아요 0")).toBeVisible();
    await page.reload();
    await expect(page.getByText("좋아요 0")).toBeVisible();
  });

  test("비로그인은 좋아요·구독 대신 로그인 링크, API는 401(quickstart #3)", async ({ page }) => {
    await page.goto(aPostPath);
    await expect(page.getByRole("link", { name: "로그인하고 좋아요 누르기" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(aPostPath)}`,
    );
    await expect(page.getByRole("button", { name: "좋아요", exact: true })).toHaveCount(0);
    const like = await callApi(page.request, "PUT", `/me/likes/${aPostPath.split("/")[2]}`);
    expect(like.status).toBe(401);
    expect(like.body.header.resultCode).toBe("UNAUTHENTICATED");

    await page.goto(`/${a.handle}`);
    await expect(page.getByRole("link", { name: "로그인하고 구독하기" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/${a.handle}`)}`,
    );
  });

  test("B가 A를 구독하면 구독자 수 0 → 1, A 화면에는 구독 버튼이 없다(quickstart #5)", async ({
    page,
  }) => {
    await logIn(page, b);
    await page.goto(`/${a.handle}`);
    await expect(page.getByText("구독자 0명")).toBeVisible();
    await page.getByRole("button", { name: "구독", exact: true }).click();
    await expect(page.getByRole("button", { name: "구독 중 (취소)" })).toBeVisible();
    await expect(page.getByText("구독자 1명")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "구독 중 (취소)" })).toBeVisible();
    await logOut(page);

    await logIn(page, a);
    await page.goto(`/${a.handle}`);
    await expect(page.getByText("구독자 1명")).toBeVisible();
    await expect(page.getByRole("button", { name: /^구독/ })).toHaveCount(0);
    const own = await callApi(page.request, "PUT", `/me/subscriptions/${a.handle}`);
    expect(own.status).toBe(422);
    expect(own.body.header.resultCode).toBe("CANNOT_SUBSCRIBE_OWN_BLOG");
  });

  test("B의 /feed에 구독한 A·C의 공개 글만 최신순, 비공개 글은 없다(quickstart #7)", async ({
    page,
  }) => {
    await signUp(page, c);
    await logOut(page);
    await logIn(page, b);
    const subscribed = await callApi(page.request, "PUT", `/me/subscriptions/${c.handle}`);
    expect(subscribed.status).toBe(200);
    await logOut(page);

    await logIn(page, a);
    await publishPost(page.request, a.handle, { title: "A의 새 글", contentMarkdown: "A 본문" });
    await publishPost(page.request, a.handle, {
      title: "A의 비공개 글",
      contentMarkdown: "비공개",
      visibility: "PRIVATE",
    });
    await logOut(page);
    await logIn(page, c);
    await publishPost(page.request, c.handle, { title: "C의 새 글", contentMarkdown: "C 본문" });
    await logOut(page);

    await logIn(page, b);
    await page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "구독 피드" })
      .click();
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByRole("heading", { level: 1, name: "구독 피드" })).toBeVisible();
    const titles = page.getByRole("list", { name: "글 목록" }).getByRole("heading", { level: 2 });
    await expect(titles).toHaveText(["C의 새 글", "A의 새 글", "좋아요 받을 글"]);
    await expect(page.getByText("A의 비공개 글")).toHaveCount(0);
    const firstPost = page.getByRole("list", { name: "글 목록" }).getByRole("article").first();
    await expect(firstPost.getByRole("link", { name: `${c.nickname}의 블로그` })).toHaveAttribute(
      "href",
      `/${c.handle}`,
    );
  });

  test("비로그인으로 /feed를 열면 로그인 화면으로", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login\?next=%2Ffeed$/);
  });
});
