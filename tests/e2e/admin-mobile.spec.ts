import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  logInWith,
  newAccount,
  publishPost,
  requireBackend,
  signUp,
} from "./support/backend.js";

/**
 * 006 모바일 360×740(spec Assumptions, quickstart #39, T068): 블로그 관리 대시보드·글 관리(일괄 작업 포함)·설정에 가로 스크롤이
 * 없고 메뉴는 접고 펼 수 있다. 관리자 계정이 있으면 콘솔 대시보드·작업 기록도 열린다(넓은 표는 가로 스크롤 상자 안).
 */
test.describe("006 모바일 360×740", () => {
  requireBackend();
  test.use({ viewport: { width: 360, height: 740 } });

  /** 문서가 화면 너비보다 넓지 않다(가로 스크롤 없음). e2e 타입 설정에는 DOM 타입이 없어 코드를 문자열로 넘긴다. */
  async function expectNoHorizontalScroll(page: Page) {
    const [scrollWidth, clientWidth] = (await page.evaluate(
      "[document.documentElement.scrollWidth, document.documentElement.clientWidth]",
    )) as [number, number];
    expect(scrollWidth, page.url()).toBeLessThanOrEqual(clientWidth);
  }

  test("블로그 관리 대시보드·글 관리 일괄 작업·설정에 가로 스크롤이 없다", async ({ page }) => {
    const owner = newAccount("mm");
    await signUp(page, owner);
    const title =
      "모바일 관리 화면에서 보는 아주 긴 제목입니다 모바일 관리 화면에서 보는 아주 긴 제목";
    await publishPost(page.request, owner.handle, { title, contentMarkdown: "모바일 관리 본문" });

    await page.goto(`/${owner.handle}/manage`);
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    const menu = page.getByRole("navigation", { name: "블로그 관리 메뉴" });
    await expect(menu).toBeVisible();
    await page.locator("summary", { hasText: "메뉴" }).click();
    await expect(menu).toBeHidden();
    await page.locator("summary", { hasText: "메뉴" }).click();
    await expect(menu).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto(`/${owner.handle}/manage/posts`);
    await page.getByLabel(`${title} 선택`).check();
    await expect(page.getByRole("button", { name: "비공개로 바꾸기" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto(`/${owner.handle}/manage/settings`);
    await expect(page.getByLabel("블로그 제목")).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("관리자 콘솔 대시보드·작업 기록(표는 가로 스크롤 상자 안)", async ({ page }) => {
    const { email, password } = adminAccount();
    test.skip(!email || !password, "E2E_ADMIN_EMAIL·E2E_ADMIN_PASSWORD가 없으면 건너뛴다.");
    await logInWith(page, email, password);

    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto("/admin/audit-log");
    await expect(page.getByRole("heading", { level: 1, name: "작업 기록" })).toBeVisible();
    await expect(page.getByRole("search", { name: "거르기" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
