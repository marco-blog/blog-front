import { expect, test } from "@playwright/test";

import {
  callApi,
  logIn,
  logOut,
  newAccount,
  portalText,
  publishPost,
  requireBackend,
  requirePortalTestSettings,
  signUp,
  topicIdBySlug,
} from "./support/backend.js";

/**
 * 003 US3 글 주제 지정과 포털 노출 설정(quickstart #17~21, T076): 블로그 기본 주제가 새 글 발행 설정에 미리 선택되고,
 * "선택 안 함"으로 발행하면 주제 페이지에는 없고 최신 글에는 있다. 주제를 바꿔 다시 발행하면 바로 그 주제 페이지에 나오고
 * 글 상세에 주제 링크가 생긴다. 대분류·없는 주제는 발행 오류. "포털에 내 글 노출"을 끄면 포털에만 빠진다.
 */
test.describe("003 US3 주제 지정·포털 노출 설정", () => {
  requireBackend();
  requirePortalTestSettings();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("ps");
  const run = owner.handle.slice(-6);
  const firstTitle = `주제선택${run} 첫 글`;
  let postId = 0;

  test("블로그 기본 주제가 새 글 발행 설정에 미리 선택되고, 선택 안 함으로 발행(#17, #18)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signUp(page, owner);
    const domestic = await topicIdBySlug(page.request, "domestic-travel");

    await page.goto(`/${owner.handle}/manage/settings`);
    await page
      .getByRole("combobox", { name: "새 글의 기본 주제" })
      .selectOption({ label: "국내여행" });
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 설정을 저장했습니다.");

    await page.goto(`/${owner.handle}/write`);
    await page.getByLabel("제목").fill(firstTitle);
    await page.locator(".ProseMirror").click();
    await page.keyboard.insertText(portalText(4, `us3-${run}`));
    await page.getByRole("button", { name: "완료" }).click();
    const dialog = page.getByRole("dialog", { name: "발행 설정" });
    const topic = dialog.getByRole("combobox", { name: "주제" });
    await expect(dialog.getByRole("combobox", { name: "카테고리" })).toBeVisible();
    await expect(topic).toHaveValue(String(domestic));

    await topic.selectOption({ label: "선택 안 함" });
    await dialog.getByRole("button", { name: "공개 발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/\\d+$`));
    postId = Number(new URL(page.url()).pathname.split("/").at(-1));
    await expect(page.getByRole("link", { name: "국내여행" })).toHaveCount(0);

    await page.goto("/topics/travel-food/domestic-travel");
    await expect(page.getByRole("heading", { level: 1, name: "국내여행" })).toBeVisible();
    expect(await page.content()).not.toContain(firstTitle);
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "최신 글" }).getByRole("heading", { name: firstTitle }),
    ).toBeVisible();
  });

  test("주제를 IT 인터넷으로 바꿔 다시 발행하면 주제 페이지와 글 상세 주제 링크(#19)", async ({
    page,
  }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/write/${postId}`);
    await page.getByRole("button", { name: "완료" }).click();
    const dialog = page.getByRole("dialog", { name: "발행 설정" });
    await dialog.getByRole("combobox", { name: "주제" }).selectOption({ label: "IT 인터넷" });
    await dialog.getByRole("button", { name: "수정 발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/${postId}$`));

    const link = page.getByRole("article").getByRole("link", { name: "IT 인터넷" });
    await expect(link).toHaveAttribute("href", "/topics/knowledge/it-internet");
    await link.click();
    await expect(page).toHaveURL(/\/topics\/knowledge\/it-internet$/);
    await expect(page.getByRole("heading", { name: firstTitle })).toBeVisible();
  });

  test("대분류 422 TOPIC_NOT_SELECTABLE, 없는 주제 404 TOPIC_NOT_FOUND(#20)", async ({ page }) => {
    await logIn(page, owner);
    const knowledge = await topicIdBySlug(page.request, "knowledge");
    const draft = await callApi<{ id: number }>(
      page.request,
      "POST",
      `/blogs/${owner.handle}/posts/drafts`,
      { title: `주제선택${run} 오류`, contentMarkdown: portalText(4, "err") },
    );
    expect(draft.status).toBe(201);
    const publish = (topicId: number) =>
      callApi(page.request, "POST", `/posts/${draft.body.result.id}/publish`, {
        visibility: "PUBLIC",
        commentEnabled: true,
        topicId,
      });

    const major = await publish(knowledge);
    expect(major.status).toBe(422);
    expect(major.body.header.resultCode).toBe("TOPIC_NOT_SELECTABLE");
    const missing = await publish(99_999_999);
    expect(missing.status).toBe(404);
    expect(missing.body.header.resultCode).toBe("TOPIC_NOT_FOUND");
  });

  test("포털 노출을 끄면 포털에서만 빠지고 블로그·RSS에는 남는다(#21)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto(`/${owner.handle}/manage/settings`);
    await page.getByLabel("포털에 이 블로그의 글 소개하기").uncheck();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 설정을 저장했습니다.");

    const offTitle = `주제선택${run} 포털 끔`;
    await publishPost(page.request, owner.handle, {
      title: offTitle,
      contentMarkdown: portalText(4, "off"),
    });
    await logOut(page);

    await page.goto("/");
    await expect(page.getByRole("region", { name: "최신 글" })).toBeVisible();
    const home = await page.content();
    expect(home).not.toContain(offTitle);
    expect(home).not.toContain(firstTitle);
    await page.goto(`/${owner.handle}`);
    await expect(page.getByRole("heading", { name: offTitle })).toBeVisible();
    const rss = await page.request.get(`/${owner.handle}/rss`);
    expect(rss.status()).toBe(200);
    expect(await rss.text()).toContain(offTitle);
  });
});
