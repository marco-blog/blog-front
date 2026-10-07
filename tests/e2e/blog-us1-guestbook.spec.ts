import { expect, test, type Page } from "@playwright/test";

import {
  callApi,
  logIn,
  logOut,
  newAccount,
  newGuestContext,
  requireBackend,
  requireGuestTestSettings,
  setBlogSettings,
  signUp,
} from "./support/backend.js";

/**
 * 004 US1 방명록 Independent Test(quickstart #1~7, T041): B가 글을 남기고 A가 답글(계층 표시), 비밀글은 A·B에게만 내용,
 * A의 삭제(답글이 있으면 자리만), 방명록을 끄면 메뉴 없음·404, 비회원 허용이면 이름·비밀번호로 쓰고 같은 비밀번호로만 고침.
 * backend가 있어야 돈다(E2E_BACKEND_URL). 비회원 시나리오는 E2E_GUEST_TEST_SETTINGS=1일 때만.
 */
test.describe("004 US1 방명록", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("ga");
  const writer = newAccount("gb");
  const third = newAccount("gc");
  const path = () => `/${owner.handle}/guestbook`;

  function entries(page: Page) {
    return page.getByRole("list", { name: "방명록 글 목록" });
  }

  async function write(page: Page, content: string, secret = false) {
    const form = page.getByRole("form", { name: "방명록 쓰기" });
    await form.getByLabel("방명록 내용").fill(content);
    if (secret) {
      await form.getByLabel("비밀글 (블로그 주인과 나만 보기)").check();
    }
    await form.getByRole("button", { name: "남기기" }).click();
    await expect(entries(page)).toContainText(secret ? "비밀글" : content);
  }

  test("B가 남기고 A가 답글을 달면 그 아래 들여쓰기로 보인다(AS1, AS3)", async ({ page }) => {
    await signUp(page, owner);
    await logOut(page);

    await signUp(page, writer);
    await page.goto(path());
    await expect(page.getByRole("navigation", { name: "블로그 메뉴" })).toContainText("방명록");
    await write(page, "안녕하세요");
    await logOut(page);

    await logIn(page, owner);
    await page.goto(path());
    const first = entries(page).getByRole("article", { name: writer.nickname });
    await first.getByText("답글 달기").click();
    const reply = first.getByRole("form", { name: "답글 쓰기" });
    await reply.getByLabel("답글 내용").fill("반가워요");
    await reply.getByRole("button", { name: "답글 등록" }).click();

    const replies = entries(page).getByRole("list", { name: "답글" });
    await expect(replies.getByRole("article", { name: owner.nickname })).toContainText("반가워요");
  });

  test("비밀글은 C·비로그인에게 '비밀글입니다', A·B에게 내용(AS2)", async ({ page }) => {
    await logIn(page, writer);
    await page.goto(path());
    await write(page, "주인만 보세요", true);
    await expect(entries(page)).toContainText("주인만 보세요");
    await logOut(page);

    await signUp(page, third);
    await page.goto(path());
    await expect(entries(page)).toContainText("비밀글입니다.");
    await expect(entries(page)).not.toContainText("주인만 보세요");
    await logOut(page);

    await page.goto(path());
    await expect(entries(page)).toContainText("비밀글입니다.");
    await expect(entries(page)).not.toContainText("주인만 보세요");

    await logIn(page, owner);
    await page.goto(path());
    await expect(entries(page)).toContainText("주인만 보세요");
  });

  test("C는 남의 글을 지우거나 답글을 달 수 없다(403)", async ({ page }) => {
    await logIn(page, third);
    const list = await callApi<{ id: number }[]>(
      page.request,
      "GET",
      `/blogs/${owner.handle}/guestbook`,
    );
    const target = list.body.result[0].id;
    const removed = await callApi(page.request, "DELETE", `/guestbook-entries/${target}`);
    const replied = await callApi(page.request, "POST", `/blogs/${owner.handle}/guestbook`, {
      content: "몰래 답글",
      parentId: target,
    });
    expect(removed.status).toBe(403);
    expect(replied.status).toBe(403);
  });

  test("A가 지우면 답글이 있는 글은 자리만, 없는 글은 사라진다(AS3)", async ({ page }) => {
    page.on("dialog", (dialog) => void dialog.accept());
    await logIn(page, owner);
    await page.goto(path());

    const secret = entries(page)
      .getByRole("article", { name: writer.nickname })
      .filter({ hasText: "주인만 보세요" });
    await secret.getByRole("button", { name: "삭제" }).click();
    await expect(entries(page)).not.toContainText("주인만 보세요");

    const first = entries(page)
      .getByRole("article", { name: writer.nickname })
      .filter({ hasText: "안녕하세요" });
    await first.getByRole("button", { name: "삭제" }).first().click();
    await expect(entries(page)).toContainText("삭제된 글입니다.");
    await expect(entries(page)).toContainText("반가워요");

    await page.goto(`/${owner.handle}/manage`);
    await expect(page.getByRole("region", { name: "최근 방명록" })).toBeVisible();
  });

  test("방명록을 끄면 메뉴에서 빠지고 404, 주인은 관리 화면에서 본다(AS4)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/settings`);
    await page.getByLabel("방명록 사용").uncheck();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 설정을 저장했습니다.");

    await page.goto(`/${owner.handle}/manage/guestbook`);
    await expect(page.getByRole("note")).toContainText("방명록이 꺼져 있어");
    await expect(page.getByRole("list", { name: "방명록 글 목록" })).toContainText("반가워요");
    await logOut(page);

    await page.goto(`/${owner.handle}`);
    await expect(page.getByRole("navigation", { name: "블로그 메뉴" })).not.toContainText("방명록");
    const response = await page.goto(path());
    expect(response?.status()).toBe(404);
    const api = await callApi(page.request, "GET", `/blogs/${owner.handle}/guestbook`);
    expect(api.status).toBe(404);
    expect(api.body.header.resultCode).toBe("GUESTBOOK_DISABLED");
  });

  test("비회원 허용이면 이름·비밀번호로 쓰고, 같은 비밀번호로만 고치고 지운다(FR-066)", async ({
    page,
    browser,
  }) => {
    requireGuestTestSettings();
    await logIn(page, owner);
    await setBlogSettings(page.request, owner.handle, {
      guestbookEnabled: true,
      guestWriteEnabled: true,
    });

    const guest = await newGuestContext(browser);
    const visitor = await guest.newPage();
    visitor.on("dialog", (dialog) => void dialog.accept());
    await visitor.goto(path());
    const form = visitor.getByRole("form", { name: "방명록 쓰기" });
    await form.getByLabel("방명록 내용").fill("비회원 인사");
    await form.getByLabel("이름").fill("손님");
    await form.getByLabel("비밀번호").fill("1234");
    await form.getByRole("button", { name: "남기기" }).click();

    const mine = entries(visitor).getByRole("article", { name: "손님" });
    await expect(mine).toContainText("비회원");
    await expect(mine).toContainText("비회원 인사");

    await mine.getByText("수정", { exact: true }).click();
    const edit = mine.getByRole("form", { name: "방명록 글 고치기" });
    await edit.getByLabel("고칠 내용").fill("고친 비회원 인사");
    await edit.getByLabel("작성할 때 입력한 비밀번호").fill("1234");
    await edit.getByRole("button", { name: "수정 완료" }).click();
    await expect(entries(visitor).getByRole("article", { name: "손님" })).toContainText(
      "고친 비회원 인사",
    );

    const again = entries(visitor).getByRole("article", { name: "손님" });
    await again.locator("summary", { hasText: "삭제" }).click();
    const remove = again.locator("form.guestbook-delete");
    await remove.getByLabel("작성할 때 입력한 비밀번호").fill("9999");
    await remove.getByRole("button", { name: "삭제" }).click();
    await expect(entries(visitor).getByRole("article", { name: "손님" })).toContainText(
      "비밀번호가 맞지 않습니다.",
    );
    await expect(entries(visitor)).toContainText("고친 비회원 인사");
    await guest.close();
  });
});
