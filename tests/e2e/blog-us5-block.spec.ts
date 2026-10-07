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
 * 004 US5 회원 차단 Independent Test(quickstart #36~38, T117): B가 A를 구독하고 댓글을 남김 → A가 댓글 관리에서 B 차단 →
 * 차단 목록에 B, 구독자 수 감소 → B의 댓글·방명록·구독은 차단을 드러내지 않는 일반 오류로 거부 → A가 해제 → B 댓글 성공.
 * backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("004 US5 회원 차단", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("ka");
  const member = newAccount("kb");
  let postPath = "";
  const forbidden = "이 작업을 할 권한이 없습니다.";

  function comments(page: Page) {
    return page.getByRole("list", { name: "댓글 목록" });
  }

  async function writeComment(page: Page, content: string) {
    const form = page.getByRole("form", { name: "댓글 내용" });
    await form.getByLabel("댓글 내용").fill(content);
    await form.getByRole("button", { name: "댓글 등록" }).click();
  }

  test("B가 구독하고 댓글을 남긴 뒤 A가 댓글 관리에서 차단하면 목록에 B, 구독자 수가 준다", async ({
    page,
  }) => {
    await signUp(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "차단 시험 글",
      contentMarkdown: "아무 의견이나 남겨 주세요.",
    });
    postPath = `/${owner.handle}/${id}`;
    await logOut(page);

    await signUp(page, member);
    await page.goto(`/${owner.handle}`);
    await page.getByRole("button", { name: "구독", exact: true }).click();
    await expect(page.getByText("구독자 1명")).toBeVisible();
    await page.goto(postPath);
    await writeComment(page, "B의 첫 댓글");
    await expect(comments(page)).toContainText("B의 첫 댓글");
    await logOut(page);

    await logIn(page, owner);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/${owner.handle}/manage/comments`);
    const list = page.getByRole("list", { name: "댓글 목록" });
    await list.getByRole("button", { name: `${member.nickname} 님 차단` }).click();
    await expect(page.getByRole("status")).toHaveText(`${member.nickname} 님을 차단했습니다.`);
    // 이미 쓴 댓글은 남는다.
    await expect(list).toContainText("B의 첫 댓글");

    await page
      .getByRole("navigation", { name: "블로그 관리 메뉴" })
      .getByRole("link", { name: "차단 목록" })
      .click();
    await expect(page.getByRole("list", { name: "차단한 회원" })).toContainText(member.nickname);

    await page.goto(`/${owner.handle}`);
    await expect(page.getByText("구독자 0명")).toBeVisible();
  });

  test("차단된 B의 댓글·방명록·구독은 일반 오류로 거부된다", async ({ page }) => {
    await logIn(page, member);
    await page.goto(postPath);
    await writeComment(page, "차단 뒤 댓글");
    const commentAlert = page.getByRole("form", { name: "댓글 내용" }).getByRole("alert");
    await expect(commentAlert).toContainText(forbidden);
    await expect(commentAlert).not.toContainText("차단");
    await expect(comments(page)).not.toContainText("차단 뒤 댓글");

    await page.goto(`/${owner.handle}/guestbook`);
    const guestbook = page.getByRole("form", { name: "방명록 쓰기" });
    await guestbook.getByLabel("방명록 내용").fill("차단 뒤 방명록");
    await guestbook.getByRole("button", { name: "남기기" }).click();
    await expect(guestbook.getByRole("alert")).toContainText(forbidden);

    await page.goto(`/${owner.handle}`);
    await expect(page.getByText("구독자 0명")).toBeVisible();
    await page.getByRole("button", { name: "구독", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(forbidden);
    await expect(page.getByText("구독자 0명")).toBeVisible();

    const api = await callApi(page.request, "PUT", `/me/subscriptions/${owner.handle}`);
    expect(api.status).toBe(403);
    expect(api.body.header.resultCode).toBe("FORBIDDEN");
    expect(JSON.stringify(api.body)).not.toMatch(/block/i);
  });

  test("A가 차단을 해제하면 B는 다시 댓글을 쓸 수 있다", async ({ page }) => {
    await logIn(page, owner);
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(`/${owner.handle}/manage/blocks`);
    await page.getByRole("button", { name: `${member.nickname} 님 차단 해제` }).click();
    await expect(page.getByRole("status")).toHaveText(
      `${member.nickname} 님의 차단을 해제했습니다.`,
    );
    await expect(page.getByText("차단한 회원이 없습니다.")).toBeVisible();
    await logOut(page);

    await logIn(page, member);
    await page.goto(postPath);
    await writeComment(page, "해제 뒤 댓글");
    await expect(comments(page)).toContainText("해제 뒤 댓글");
  });
});
