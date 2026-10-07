import { expect, test, type Page } from "@playwright/test";

import { newAccount, publishPost, requireBackend, signUp } from "./support/backend.js";

/**
 * 004 모바일 화면(spec Assumptions, quickstart #43, T125): 360×740에서 블로그 홈(사이드바가 본문 아래), 방명록,
 * 블로그 관리 꾸미기에 가로 스크롤이 없다. backend가 있어야 돈다(E2E_BACKEND_URL).
 */
test.describe("004 모바일 360×740", () => {
  requireBackend();
  test.use({ viewport: { width: 360, height: 740 } });

  /** 문서가 화면 너비보다 넓지 않다(가로 스크롤 없음). e2e 타입 설정에는 DOM 타입이 없어 코드를 문자열로 넘긴다. */
  async function expectNoHorizontalScroll(page: Page) {
    const [scrollWidth, clientWidth] = (await page.evaluate(
      "[document.documentElement.scrollWidth, document.documentElement.clientWidth]",
    )) as [number, number];
    expect(scrollWidth, page.url()).toBeLessThanOrEqual(clientWidth);
  }

  test("블로그 홈·방명록·꾸미기에 가로 스크롤이 없고, 사이드바는 본문 아래", async ({ page }) => {
    const owner = newAccount("ma");
    await signUp(page, owner);
    await publishPost(page.request, owner.handle, {
      title: "모바일에서 보는 아주 긴 제목입니다 모바일에서 보는 아주 긴 제목입니다",
      contentMarkdown: `모바일 본문 ${"긴단어".repeat(40)}\n\n\`\`\`\n${"code".repeat(60)}\n\`\`\``,
    });

    await page.goto(`/${owner.handle}`);
    const main = page.locator(".blog-layout-main");
    const sidebar = page.getByRole("complementary", { name: "블로그 사이드바" });
    await expect(sidebar).toBeVisible();
    const mainBox = await main.boundingBox();
    const sideBox = await sidebar.boundingBox();
    expect(mainBox && sideBox).toBeTruthy();
    expect(sideBox!.y).toBeGreaterThanOrEqual(mainBox!.y + mainBox!.height - 1);
    expect(sideBox!.x + sideBox!.width).toBeLessThanOrEqual(360);
    await expectNoHorizontalScroll(page);

    await page.goto(`/${owner.handle}/guestbook`);
    await expect(page.getByRole("form", { name: "방명록 쓰기" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.goto(`/${owner.handle}/manage/design`);
    await expect(page.getByRole("form", { name: "사이드바" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
