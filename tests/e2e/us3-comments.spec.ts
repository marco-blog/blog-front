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
 * US3 댓글로 소통하기 Independent Test(quickstart #11, T192): 회원 A의 글에 B가 댓글, A가 답글, 답글에 답글 시도 거부,
 * A가 B의 댓글 삭제, 비로그인은 로그인 안내. 댓글 관리·대시보드 수치와 블로그 댓글 막기(FR-029)도 확인한다.
 * backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("US3 댓글", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("ca");
  const reader = newAccount("cb");
  const script = "<script>globalThis.__xss = 1</script>";
  let postId = 0;
  let postPath = "";

  function comments(page: Page) {
    return page.getByRole("list", { name: "댓글 목록" });
  }

  test("A가 글을 발행하고 B가 댓글을 쓰고 고친다(작성자·시각 표시, 출력 이스케이프)", async ({
    page,
  }) => {
    await signUp(page, owner);
    postId = await publishPost(page.request, owner.handle, {
      title: "댓글 받을 글",
      contentMarkdown: "의견을 남겨 주세요.",
    });
    postPath = `/${owner.handle}/${postId}`;
    await logOut(page);

    await signUp(page, reader);
    await page.goto(postPath);
    await expect(page.getByRole("heading", { name: "댓글 0" })).toBeVisible();
    const form = page.getByRole("form", { name: "댓글 내용" });
    await form.getByLabel("댓글 내용").fill(`첫 댓글입니다 ${script}`);
    await form.getByRole("button", { name: "댓글 등록" }).click();

    const mine = comments(page).getByRole("article", { name: reader.nickname });
    await expect(mine).toContainText(`첫 댓글입니다 ${script}`);
    await expect(mine.locator("time")).toBeVisible();
    await expect(page.getByRole("heading", { name: "댓글 1" })).toBeVisible();
    expect(await page.evaluate(() => (globalThis as { __xss?: number }).__xss)).toBeUndefined();
    await expect(form.getByLabel("댓글 내용")).toHaveValue("");

    await mine.getByText("수정", { exact: true }).click();
    const edit = mine.getByRole("form", { name: "고칠 내용" });
    await edit.getByLabel("고칠 내용").fill("고친 첫 댓글");
    await edit.getByRole("button", { name: "수정 완료" }).click();
    await expect(comments(page).getByRole("article", { name: reader.nickname })).toContainText(
      "고친 첫 댓글",
    );
    await expect(comments(page)).toContainText("(수정됨)");
  });

  test("A가 답글을 달면 한 단계 들여쓰고, 답글에 답글은 거부된다(REPLY_DEPTH_EXCEEDED)", async ({
    page,
  }) => {
    await logIn(page, owner);
    await page.goto(postPath);
    const top = comments(page).getByRole("article", { name: reader.nickname });
    await top.getByText("답글 달기").click();
    const reply = top.getByRole("form", { name: "답글 내용" });
    await reply.getByLabel("답글 내용").fill("주인의 답글입니다");
    await reply.getByRole("button", { name: "답글 등록" }).click();

    const replies = comments(page).getByRole("list", { name: "답글" });
    const ownerReply = replies.getByRole("article", { name: owner.nickname });
    await expect(ownerReply).toContainText("주인의 답글입니다");
    await expect(replies).toHaveCSS("margin-left", "32px");
    await expect(ownerReply.getByText("답글 달기")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "댓글 2" })).toBeVisible();

    const list = await callApi<{ id: number; replies: { id: number }[] }[]>(
      page.request,
      "GET",
      `/posts/${postId}/comments`,
    );
    const replyId = list.body.result[0].replies[0].id;
    const nested = await callApi(page.request, "POST", `/posts/${postId}/comments`, {
      content: "답글의 답글",
      parentId: replyId,
    });
    expect(nested.status).toBe(422);
    expect(nested.body.header.resultCode).toBe("REPLY_DEPTH_EXCEEDED");
  });

  test("대시보드와 댓글 관리에 B의 댓글이 보인다", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage`);
    await expect(page.getByText("2개")).toBeVisible();
    await expect(page.getByText("고친 첫 댓글")).toBeVisible();

    await page
      .getByRole("navigation", { name: "블로그 관리 메뉴" })
      .getByRole("link", { name: "댓글" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage/comments$`));
    const list = page.getByRole("list", { name: "댓글 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(
      list.getByRole("link", { name: "댓글 받을 글에 남긴 댓글" }).first(),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  });

  test("A가 B의 댓글을 지우면 답글이 남아 삭제 자리만 보인다", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(postPath);
    page.once("dialog", (dialog) => dialog.accept());
    const top = comments(page).getByRole("article", { name: reader.nickname });
    await expect(top.getByText("수정", { exact: true })).toHaveCount(0);
    await top.getByRole("button", { name: "삭제" }).click();

    await expect(comments(page).getByText("삭제된 댓글입니다.")).toBeVisible();
    await expect(comments(page).getByText("고친 첫 댓글")).toHaveCount(0);
    await expect(comments(page).getByRole("article", { name: owner.nickname })).toContainText(
      "주인의 답글입니다",
    );
    await expect(page.getByRole("heading", { name: "댓글 1" })).toBeVisible();
  });

  test("비로그인은 로그인 안내를 받고, 쓰기 API는 401(AS5)", async ({ page }) => {
    await logOut(page);
    await page.goto(postPath);
    const login = page.getByRole("link", { name: "댓글을 쓰려면 로그인하세요" });
    await expect(login).toHaveAttribute("href", `/login?next=${encodeURIComponent(postPath)}`);
    await expect(page.getByRole("form", { name: "댓글 내용" })).toHaveCount(0);
    const anonymous = await callApi(page.request, "POST", `/posts/${postId}/comments`, {
      content: "몰래",
    });
    expect(anonymous.status).toBe(401);

    await login.click();
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("블로그 댓글을 막으면 B는 안내만 보고 쓰기는 COMMENTS_DISABLED(FR-029)", async ({
    page,
  }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/settings`);
    await page.getByLabel("이 블로그에 댓글 허용").uncheck();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 설정을 저장했습니다.");
    await logOut(page);

    await logIn(page, reader);
    await page.goto(postPath);
    await expect(page.getByRole("note")).toHaveText("이 글에는 댓글을 쓸 수 없습니다.");
    await expect(page.getByRole("form", { name: "댓글 내용" })).toHaveCount(0);
    const blocked = await callApi(page.request, "POST", `/posts/${postId}/comments`, {
      content: "막혔나요",
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.header.resultCode).toBe("COMMENTS_DISABLED");
  });
});
