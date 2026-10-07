import { expect, test, type Page } from "@playwright/test";

import {
  logIn,
  logOut,
  newAccount,
  newGuestContext,
  publishPost,
  requireBackend,
  requireGuestTestSettings,
  setBlogSettings,
  signUp,
  waitForPublic,
} from "./support/backend.js";

/**
 * 004 US3 글 공개 옵션 Independent Test(quickstart #17~27, T089): 보호 글(잠금 → 비밀번호 → 본문, 목록·RSS는 제목만,
 * 5번 틀리면 잠김 안내), 예약 발행(바로는 404·목록 없음 → 예약 시각 뒤 목록·피드에 나타남, 화면에서 예약하고 취소),
 * 비밀 댓글(AS4), 비회원 댓글(AS5, E2E_GUEST_TEST_SETTINGS=1일 때)과 허용을 끄면 로그인 안내(AS6).
 * backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("004 US3 글 공개 옵션", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("pa");
  const reader = newAccount("pb");
  const protectedTitle = "보호 글 제목";
  const protectedBody = "비밀번호를 아는 사람만 보는 본문";
  const password = "open-1234";
  let publicPath = "";

  async function writeAndOpenDialog(page: Page, title: string, body: string) {
    await page.goto(`/${owner.handle}/write`);
    await page.getByLabel("제목").fill(title);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type(body);
    await page.getByRole("button", { name: "완료" }).click();
    const dialog = page.getByRole("dialog", { name: "발행 설정" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  function comments(page: Page) {
    return page.getByRole("list", { name: "댓글 목록" });
  }

  test("보호 글: 다른 사람은 제목만 보고 비밀번호로 연다. 목록·RSS에는 제목만(Independent Test)", async ({
    page,
    browser,
  }) => {
    await signUp(page, owner);
    const dialog = await writeAndOpenDialog(page, protectedTitle, protectedBody);
    await dialog.getByLabel("보호(비밀번호를 아는 사람만)").check();
    await dialog.getByLabel("보호 글 비밀번호").fill(password);
    await dialog.getByRole("button", { name: "공개 발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/\\d+$`));
    const postPath = new URL(page.url()).pathname;
    // 주인은 잠금 없이 본문을 본다.
    await expect(page.getByText(protectedBody)).toBeVisible();

    const guest = await newGuestContext(browser);
    const visitor = await guest.newPage();
    await visitor.goto(postPath);
    await expect(visitor.getByRole("heading", { name: protectedTitle })).toBeVisible();
    const unlock = visitor.getByRole("form", { name: "보호 글 열기" });
    await expect(unlock).toContainText("보호된 글입니다.");
    await expect(visitor.getByText(protectedBody)).toHaveCount(0);
    await expect(visitor.getByRole("list", { name: "댓글 목록" })).toHaveCount(0);

    await unlock.getByLabel("비밀번호").fill("wrong-pass");
    await unlock.getByRole("button", { name: "열기" }).click();
    await expect(unlock).toContainText("비밀번호가 맞지 않습니다.");

    await unlock.getByLabel("비밀번호").fill(password);
    await unlock.getByRole("button", { name: "열기" }).click();
    await expect(visitor.getByText(protectedBody)).toBeVisible();
    // 열람 쿠키로 다시 와도 열린 채
    await visitor.reload();
    await expect(visitor.getByText(protectedBody)).toBeVisible();

    await visitor.goto(`/${owner.handle}`);
    await expect(visitor.getByRole("main")).toContainText(protectedTitle);
    await expect(visitor.getByRole("main")).not.toContainText(protectedBody);
    await guest.close();

    const rss = await page.request.get(`/${owner.handle}/rss`);
    expect(rss.status()).toBe(200);
    const xml = await rss.text();
    expect(xml).toContain(protectedTitle);
    expect(xml).not.toContain(protectedBody);
  });

  test("같은 보호 글에 5번 틀리면 잠시 막힌다는 안내", async ({ page, browser }) => {
    await logIn(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "잠금 시험 글",
      contentMarkdown: "잠금 시험 본문",
      visibility: "PROTECTED",
      password,
    });

    const guest = await newGuestContext(browser);
    const visitor = await guest.newPage();
    await visitor.goto(`/${owner.handle}/${id}`);
    const unlock = visitor.getByRole("form", { name: "보호 글 열기" });
    for (let attempt = 1; attempt <= 5; attempt++) {
      await unlock.getByLabel("비밀번호").fill(`wrong-${attempt}`);
      await unlock.getByRole("button", { name: "열기" }).click();
      await expect(unlock).toContainText("비밀번호가 맞지 않습니다.");
    }
    // 여섯 번째는 맞는 비밀번호여도 막힌다.
    await unlock.getByLabel("비밀번호").fill(password);
    await unlock.getByRole("button", { name: "열기" }).click();
    await expect(unlock).toContainText("비밀번호를 여러 번 틀렸습니다.");
    await expect(visitor.getByText("잠금 시험 본문")).toHaveCount(0);
    await guest.close();
  });

  test("예약 발행: 예약 시각 전에는 404·목록 없음, 지나면 목록·피드에 나타난다", async ({
    page,
    browser,
  }) => {
    // 예약 발행 작업 주기(30초) + 여유
    test.setTimeout(150_000);
    await logIn(page, owner);
    const title = `예약 글 ${Date.now().toString(36)}`;
    const id = await publishPost(page.request, owner.handle, {
      title,
      contentMarkdown: "예약한 본문",
      scheduledAt: new Date(Date.now() + 20_000).toISOString(),
    });

    const guest = await newGuestContext(browser);
    const visitor = await guest.newPage();
    const early = await visitor.goto(`/${owner.handle}/${id}`);
    expect(early?.status()).toBe(404);
    await visitor.goto(`/${owner.handle}`);
    await expect(visitor.getByRole("main")).not.toContainText(title);

    await waitForPublic(guest.request, `/${owner.handle}/${id}`);
    await visitor.goto(`/${owner.handle}/${id}`);
    await expect(visitor.getByRole("heading", { name: title })).toBeVisible();
    await visitor.goto(`/${owner.handle}`);
    await expect(visitor.getByRole("main")).toContainText(title);
    await expect
      .poll(async () => (await guest.request.get(`/${owner.handle}/rss`)).text())
      .toContain(title);
    await guest.close();
  });

  test("화면에서 예약하면 글 관리 예약 목록으로 가고, 예약 취소하면 임시저장으로", async ({
    page,
  }) => {
    await logIn(page, owner);
    const title = "화면에서 예약한 글";
    const dialog = await writeAndOpenDialog(page, title, "나중에 발행할 본문");
    await dialog.getByLabel("예약 발행").check();
    const day = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await dialog.getByLabel("발행할 날짜와 시각").fill(`${day}T12:00`);
    await dialog.getByRole("button", { name: "예약 발행" }).click();

    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage/posts\\?status=SCHEDULED$`));
    const list = page.getByRole("list", { name: "글 목록" });
    await expect(list).toContainText(title);
    await expect(list).toContainText("발행 예약");

    await list.getByRole("button", { name: `예약 취소: ${title}` }).click();
    await expect(page.getByRole("status")).toHaveText(
      "예약을 취소했습니다. 글은 임시저장 상태로 돌아갔습니다.",
    );
    await expect(page.getByRole("list", { name: "글 목록" })).toHaveCount(0);
  });

  test("비밀 댓글은 글 주인과 작성자만 내용을 본다(AS4)", async ({ page, browser }) => {
    await logIn(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "댓글 받을 공개 글",
      contentMarkdown: "의견을 남겨 주세요.",
    });
    publicPath = `/${owner.handle}/${id}`;
    await logOut(page);

    await signUp(page, reader);
    await page.goto(publicPath);
    const form = page.getByRole("form", { name: "댓글 내용" });
    await form.getByLabel("댓글 내용").fill("주인만 보세요");
    await form.getByLabel("비밀 댓글").check();
    await form.getByRole("button", { name: "댓글 등록" }).click();
    const mine = comments(page).getByRole("article", { name: reader.nickname });
    await expect(mine).toContainText("주인만 보세요");
    await expect(mine).toContainText("비밀 댓글");
    await logOut(page);

    const guest = await newGuestContext(browser);
    const visitor = await guest.newPage();
    await visitor.goto(publicPath);
    await expect(comments(visitor)).toContainText("비밀 댓글입니다.");
    await expect(comments(visitor)).not.toContainText("주인만 보세요");
    await guest.close();

    await logIn(page, owner);
    await page.goto(publicPath);
    await expect(comments(page)).toContainText("주인만 보세요");
  });

  test("비회원 허용이면 이름·비밀번호로 쓰고 같은 비밀번호로 고치고 지운다. 끄면 로그인 안내(AS5, AS6)", async ({
    page,
    browser,
  }) => {
    requireGuestTestSettings();
    await logIn(page, owner);
    await setBlogSettings(page.request, owner.handle, { guestWriteEnabled: true });

    const guest = await newGuestContext(browser);
    const visitor = await guest.newPage();
    visitor.on("dialog", (dialog) => void dialog.accept());
    await visitor.goto(publicPath);
    const form = visitor.getByRole("form", { name: "댓글 내용" });
    await form.getByLabel("댓글 내용").fill("비회원 댓글");
    await form.getByLabel("이름").fill("나그네");
    await form.getByLabel("비밀번호").fill("4321");
    await form.getByRole("button", { name: "댓글 등록" }).click();

    const mine = () => comments(visitor).getByRole("article", { name: "나그네" });
    await expect(mine()).toContainText("비회원");
    await expect(mine()).toContainText("비회원 댓글");

    await mine().locator("summary", { hasText: "수정" }).click();
    const edit = mine().getByRole("form", { name: "고칠 내용" });
    await edit.getByLabel("고칠 내용").fill("고친 비회원 댓글");
    await edit.getByLabel("작성할 때 입력한 비밀번호").fill("0000");
    await edit.getByRole("button", { name: "수정 완료" }).click();
    await expect(mine()).toContainText("비밀번호가 맞지 않습니다.");

    await edit.getByLabel("고칠 내용").fill("고친 비회원 댓글");
    await edit.getByLabel("작성할 때 입력한 비밀번호").fill("4321");
    await edit.getByRole("button", { name: "수정 완료" }).click();
    await expect(mine()).toContainText("고친 비회원 댓글");

    await mine().locator("summary", { hasText: "삭제" }).click();
    const remove = mine().locator("form.comment-delete");
    await remove.getByLabel("작성할 때 입력한 비밀번호").fill("4321");
    await remove.getByRole("button", { name: "삭제" }).click();
    await expect(comments(visitor)).not.toContainText("고친 비회원 댓글");

    await setBlogSettings(page.request, owner.handle, { guestWriteEnabled: false });
    await visitor.goto(publicPath);
    await expect(visitor.getByRole("link", { name: "댓글을 쓰려면 로그인하세요" })).toBeVisible();
    await expect(visitor.getByRole("form", { name: "댓글 내용" })).toHaveCount(0);
    await guest.close();
  });
});
