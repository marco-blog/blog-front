import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  callApi,
  logOut,
  newAccount,
  portalText,
  publishPost,
  requireBackend,
  requirePortalTestSettings,
  signUp,
  type Account,
} from "./support/backend.js";

/**
 * 003 US1 포털 메인 Independent Test(quickstart #2~8, #10, T046): 세 블로그가 30편을 발행하면 메인에 영역이 정해진 순서로
 * 나오고, 영역마다 한 블로그의 글은 2편 이하다. 비공개·삭제·짧은 글은 없다. "더 보기"는 다음 묶음을 잇고, JS가 없어도
 * 카드 제목과 meta가 HTML에 있다. 끝까지 읽은 글은 인기 글에 들어온다.
 * backend를 포털 시험 설정(캐시 끔, 가입 후 대기 없음)으로 띄웠을 때만 돈다.
 */
test.describe("003 US1 포털 메인", () => {
  requireBackend();
  requirePortalTestSettings();
  test.describe.configure({ mode: "serial" });

  const writers = [newAccount("pa"), newAccount("pb"), newAccount("pc")];
  const run = writers[0].handle.slice(-6);
  const titleOf = (writer: number, n: number) => `포털${run} ${writer}번 블로그 ${n}번 글`;
  const hidden = {
    private: `포털${run} 비공개 글`,
    trashed: `포털${run} 삭제한 글`,
    short: `포털${run} 짧은 글`,
  };

  /** 메인 영역(이름 붙은 section·nav) 순서. 릴리스 노트 카드는 이름이 없어 class로 찾는다. */
  const ORDER = [
    "release-note",
    "운영자 추천",
    "주제",
    "인기 글",
    "최신 글",
    "인기 태그",
    "새로 시작한 블로그",
  ];

  async function regionOrder(page: Page) {
    return page
      .locator("main")
      .evaluate((main) =>
        [
          ...main.querySelectorAll(".portal-release-note, section[aria-label], nav[aria-label]"),
        ].map((element) =>
          element.classList.contains("portal-release-note")
            ? "release-note"
            : (element.getAttribute("aria-label") ?? ""),
        ),
      );
  }

  /** 영역 안 카드의 블로그 주소별 개수 */
  async function cardsPerBlog(region: Locator) {
    const hrefs = await region
      .locator(".portal-card .portal-card-meta > a")
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
    const counts = new Map<string, number>();
    for (const href of hrefs) {
      counts.set(href, (counts.get(href) ?? 0) + 1);
    }
    return counts;
  }

  async function publishAll(page: Page, writer: Account, index: number) {
    await signUp(page, writer);
    for (let n = 1; n <= 10; n += 1) {
      await publishPost(page.request, writer.handle, {
        title: titleOf(index, n),
        contentMarkdown: portalText(4, `${index}-${n}`),
      });
    }
  }

  test("세 블로그 30편 → 영역 순서, 영역마다 블로그당 2편 이하, 숨는 글 없음(#2~5)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    for (const [index, writer] of writers.entries()) {
      await publishAll(page, writer, index);
      if (index === 0) {
        // 비공개 글, 휴지통으로 보낸 글, 최소 길이(200자)보다 짧은 150자 글은 포털에 나오지 않는다.
        await publishPost(page.request, writer.handle, {
          title: hidden.private,
          contentMarkdown: portalText(4, "비공개"),
          visibility: "PRIVATE",
        });
        const trashed = await publishPost(page.request, writer.handle, {
          title: hidden.trashed,
          contentMarkdown: portalText(4, "삭제"),
        });
        expect((await callApi(page.request, "DELETE", `/posts/${trashed}`)).status).toBe(200);
        await publishPost(page.request, writer.handle, {
          title: hidden.short,
          contentMarkdown: "짧".repeat(150),
        });
      }
      await logOut(page);
    }

    await page.goto("/");
    await expect(page.getByRole("region", { name: "최신 글" })).toBeVisible();

    const order = (await regionOrder(page)).filter((name) => ORDER.includes(name));
    expect(order).toEqual([...order].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)));
    expect(order).toEqual(expect.arrayContaining(["주제", "최신 글", "새로 시작한 블로그"]));

    // 가장 최근에 발행한 세 블로그는 최신 글 첫 묶음에 각각 최신 2편씩만 나온다.
    const latest = page.getByRole("region", { name: "최신 글" });
    for (const index of writers.keys()) {
      await expect(latest.getByRole("heading", { name: titleOf(index, 10) })).toBeVisible();
      await expect(latest.getByRole("heading", { name: titleOf(index, 9) })).toBeVisible();
      await expect(latest.getByRole("heading", { name: titleOf(index, 8) })).toHaveCount(0);
    }
    for (const name of ["운영자 추천", "인기 글", "최신 글"]) {
      const region = page.getByRole("region", { name });
      if ((await region.count()) === 0) {
        continue;
      }
      for (const [blog, count] of await cardsPerBlog(region)) {
        expect(count, `${name} 영역의 ${blog}`).toBeLessThanOrEqual(2);
      }
    }

    // 새로 시작한 블로그: 방금 첫 글을 발행한 블로그
    const newBlogs = page.getByRole("region", { name: "새로 시작한 블로그" });
    await expect(newBlogs.locator(`a[href="/${writers[2].handle}"]`).first()).toBeVisible();

    const html = await page.content();
    for (const title of Object.values(hidden)) {
      expect(html).not.toContain(title);
    }
  });

  test('"더 보기"는 다음 최신 글 묶음을 이어 붙인다(#6)', async ({ page }) => {
    test.setTimeout(180_000);
    // 블로그당 2편 제한 때문에 첫 묶음(20편)을 채우려면 블로그가 10개 넘게 있어야 한다: 세 회원이 블로그 3개씩, 2편씩 발행
    for (const prefix of ["pd", "pe", "pf"]) {
      const owner = newAccount(prefix);
      await signUp(page, owner);
      const handles = [owner.handle, `${owner.handle}-b`, `${owner.handle}-c`];
      for (const handle of handles.slice(1)) {
        expect((await callApi(page.request, "POST", "/blogs", { handle })).status).toBe(201);
      }
      for (const handle of handles) {
        for (const n of [1, 2]) {
          await publishPost(page.request, handle, {
            title: `포털${run} ${handle} 묶음 ${n}`,
            contentMarkdown: portalText(4, handle),
          });
        }
      }
      await logOut(page);
    }

    await page.goto("/");
    const latest = page.getByRole("region", { name: "최신 글" });
    await expect(latest.locator(".portal-card")).toHaveCount(20);
    // 첫 묶음: 새 블로그 9개×2편 + 그다음으로 최근인 2번 블로그 2편. 1번 블로그 글은 다음 묶음에 있다.
    await expect(latest.getByRole("heading", { name: titleOf(1, 10) })).toHaveCount(0);

    await latest.getByRole("link", { name: "더 보기" }).click();
    await expect(latest.getByRole("heading", { name: titleOf(1, 10) })).toBeVisible();
    expect(await latest.locator(".portal-card").count()).toBeGreaterThan(20);
    await expect(page).toHaveURL(/\/$/);
  });

  test("JS 없이도 카드 제목·meta가 HTML에 있고, 더 보기는 링크로 동작한다(#7)", async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "ko-KR" });
    const page = await context.newPage();
    await page.goto("/");

    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /주제별 인기 글과 최신 글/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    const latest = page.getByRole("region", { name: "최신 글" });
    await expect(latest.getByRole("heading", { name: titleOf(2, 10) })).toBeVisible();
    await expect(latest.getByRole("heading", { name: titleOf(1, 10) })).toHaveCount(0);

    await latest.getByRole("link", { name: "더 보기" }).click();
    await expect(page).toHaveURL(/[?&]cursor=/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(
      page.getByRole("region", { name: "최신 글" }).getByRole("heading", { name: titleOf(1, 10) }),
    ).toBeVisible();
    await context.close();
  });

  test("끝까지 읽은 글은 인기 글에 들어온다(#8, #10)", async ({ page }) => {
    // 0번 블로그의 1번 글은 메인에 없으니(블로그당 2편) 블로그 화면에서 찾는다.
    await page.goto(`/${writers[0].handle}`);
    const readPostPath = await page
      .getByRole("link", { name: titleOf(0, 1), exact: true })
      .first()
      .getAttribute("href");
    expect(readPostPath).toMatch(new RegExp(`^/${writers[0].handle}/\\d+$`));

    const readComplete = page.waitForResponse(
      (response) =>
        response.url().endsWith("/read-complete") && response.request().method() === "POST",
    );
    await page.goto(readPostPath!);
    await page.keyboard.press("End");
    expect((await readComplete).status()).toBe(200);

    await page.goto("/");
    const popular = page.getByRole("region", { name: "인기 글" });
    await expect(popular.getByRole("heading", { name: titleOf(0, 1) })).toBeVisible();
  });
});
