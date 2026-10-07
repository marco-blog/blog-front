import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  logInWith,
  logOut,
  newAccount,
  publishPost,
  requireAdmin,
  requireBackend,
  requireModerationTestSettings,
  sendTrackbackPing,
  signUp,
} from "./support/backend.js";

/**
 * 005 모바일 화면(quickstart #42, T110): 360×740에서 글 상세의 트랙백 영역, 신고 레이어, `/rights-request`,
 * `/admin/reports`(관리자가 있을 때)에 가로 스크롤이 없다.
 */
test.describe("005 모바일 360×740", () => {
  requireBackend();
  requireModerationTestSettings();
  test.use({ viewport: { width: 360, height: 740 } });

  /** 문서가 화면 너비보다 넓지 않다(가로 스크롤 없음). e2e 타입 설정에는 DOM 타입이 없어 코드를 문자열로 넘긴다. */
  async function expectNoHorizontalScroll(page: Page) {
    const [scrollWidth, clientWidth] = (await page.evaluate(
      "[document.documentElement.scrollWidth, document.documentElement.clientWidth]",
    )) as [number, number];
    expect(scrollWidth, page.url()).toBeLessThanOrEqual(clientWidth);
  }

  test("글 상세 트랙백 영역·신고 레이어·권리 침해 신고에 가로 스크롤이 없다", async ({ page }) => {
    test.setTimeout(90_000);
    const owner = newAccount("mo");
    await signUp(page, owner);
    const postId = await publishPost(page.request, owner.handle, {
      title: "모바일 트랙백 글",
      contentMarkdown: "모바일에서 트랙백 영역을 보는 글입니다.",
    });
    const long = "긴주소".repeat(30);
    const ping = await sendTrackbackPing(page.request, owner.handle, postId, {
      url: `https://very-long-host-name.example/${encodeURIComponent(long)}/${"segment".repeat(20)}`,
      title: `아주긴트랙백제목${"가나다라마바사".repeat(20)}`,
      excerpt: `요약${"abcdefghij".repeat(30)}`,
      blog_name: "모바일 블로그",
    });
    expect(ping.error).toBe(0);

    // 신고 버튼은 다른 회원에게 보인다
    await logOut(page);
    await signUp(page, newAccount("mr"));
    await page.goto(`/${owner.handle}/${postId}`);
    await expect(page.getByLabel("트랙백 주소")).toBeVisible();
    await expect(page.getByRole("list", { name: "받은 트랙백" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    const form = page.getByRole("form", { name: "글 신고" });
    await expect(async () => {
      if (!(await form.isVisible())) {
        await page.locator(".post-actions").getByText("신고", { exact: true }).click();
      }
      await expect(form).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await expectNoHorizontalScroll(page);

    await page.goto(`/rights-request?url=${encodeURIComponent(`/${owner.handle}/${postId}`)}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("관리자 신고 목록에 가로 스크롤이 없다", async ({ page }) => {
    requireAdmin();
    const { email, password } = adminAccount();
    await logInWith(page, email, password);
    await page.goto("/admin/reports");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
