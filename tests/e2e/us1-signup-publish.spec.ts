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

// US1 Independent Test(quickstart #1~6, #17·18). backend가 있어야 돈다(E2E_BACKEND_URL).
test.describe("US1 가입 → 글 발행 → 공개 화면", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  // serial이어도 테스트마다 새 브라우저 컨텍스트라 쿠키가 없다. 첫 테스트에서 가입한 계정으로 매번 로그인한다.
  const owner = newAccount("p");

  test("가입하면 바로 로그인되고 빈 블로그가 열린다 (#1)", async ({ page }) => {
    await signUp(page, owner);

    await expect(page.getByText("아직 발행한 글이 없습니다.")).toBeVisible();
  });

  test("같은 주소·예약어 주소는 가입 화면에서 막는다 (#2)", async ({ page }) => {
    await page.goto("/signup");
    const handle = page.getByLabel("블로그 주소");

    await handle.fill(owner.handle);
    await expect(page.getByText("이미 사용 중인 주소입니다.")).toBeVisible();
    await handle.fill("login");
    await expect(page.getByText("사용할 수 없는 주소입니다.")).toBeVisible();
  });

  test("에디터로 쓰고 완료 → 공개 발행하면 글 화면으로 간다 (#3)", async ({ page }) => {
    await logIn(page, owner);
    await page.goto("/write");
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/write$`));

    await page.getByLabel("제목").fill("한글 제목입니다");
    const body = page.locator(".ProseMirror");
    await body.click();
    await page.keyboard.type("한글 본문을 씁니다.");

    await page.getByRole("button", { name: "완료" }).click();
    const dialog = page.getByRole("dialog", { name: "발행 설정" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/write$`));

    await dialog.getByRole("button", { name: "공개 발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/\\d+$`));
    await expect(page.getByRole("heading", { name: "한글 제목입니다" })).toBeVisible();
    await expect(page.getByText("한글 본문을 씁니다.")).toBeVisible();
  });

  test("JS 없이도 글 상세 HTML에 제목·본문·og:title이 있다 (#4, SC-005)", async ({
    browser,
    page,
  }) => {
    await logIn(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "서버 렌더링 확인",
      contentMarkdown: "본문 문단입니다.",
    });

    const context = await browser.newContext({ javaScriptEnabled: false });
    const anonymous = await context.newPage();
    const response = await anonymous.goto(`/${owner.handle}/${id}`);
    expect(response?.status()).toBe(200);
    const html = await response!.text();
    expect(html).toContain("서버 렌더링 확인");
    expect(html).toContain("본문 문단입니다.");
    expect(html).toMatch(/<meta property="og:title" content="서버 렌더링 확인"/);
    await context.close();
  });

  test("비공개 글은 다른 계정·비로그인에게 404 (#5)", async ({ page, browser }) => {
    await logIn(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "나만 보는 글",
      contentMarkdown: "비밀",
      visibility: "PRIVATE",
    });
    expect((await page.goto(`/${owner.handle}/${id}`))?.status()).toBe(200);

    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    expect((await anonymousPage.goto(`/${owner.handle}/${id}`))?.status()).toBe(404);

    await signUp(anonymousPage, newAccount("o"));
    expect((await anonymousPage.goto(`/${owner.handle}/${id}`))?.status()).toBe(404);
    await anonymous.close();
  });

  test("본문의 <script>는 실행되지도 텍스트로 남지도 않는다 (#6)", async ({ page }) => {
    await logIn(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "스크립트 무력화",
      contentMarkdown: "앞 문단\n\n<script>window.__xss = 1</script>\n\n뒤 문단",
    });

    const response = await page.goto(`/${owner.handle}/${id}`);
    const html = await response!.text();
    const article = /<article[\s\S]*<\/article>/.exec(html)?.[0] ?? html;
    expect(article).not.toContain("<script>window.__xss");
    expect(article).not.toContain("window.__xss");
    expect(await page.evaluate(() => (globalThis as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("java·c++ 코드 블록은 서버에서 hljs 강조, 언어 없는 블록은 강조 없음 (#17)", async ({
    page,
    request,
  }) => {
    await logIn(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "코드 강조",
      contentMarkdown:
        "```java\npublic class A {}\n```\n\n```c++\nint main() {}\n```\n\n```\nplain text\n```",
    });

    const html = await (await request.get(`/${owner.handle}/${id}`)).text();
    expect(html).toMatch(/<code class="[^"]*language-java[^"]*"><span class="hljs-/);
    // backend 살균기는 class의 +를 &#43;로 인코딩한다. front가 풀어서 c++로 알아봐야 한다.
    expect(html).toMatch(/<code class="language-c&#43;&#43; hljs"><span class="hljs-/);
    expect(html).toMatch(/<code>plain text\n?<\/code>/);
  });

  test("YouTube·Vimeo만 재생기로 남고 다른 iframe은 지운다 (#18)", async ({ page, request }) => {
    await logIn(page, owner);
    const id = await publishPost(page.request, owner.handle, {
      title: "외부 영상",
      contentMarkdown: [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "",
        "https://vimeo.com/76979871",
        "",
        '<iframe src="https://evil.example/frame"></iframe>',
      ].join("\n"),
    });

    const html = await (await request.get(`/${owner.handle}/${id}`)).text();
    expect(html).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(html).toContain("https://player.vimeo.com/video/76979871");
    expect(html).not.toContain("evil.example");
  });

  test("로그아웃하면 글쓰기는 로그인으로 보낸다", async ({ page }) => {
    await logOut(page);
    await page.goto(`/${owner.handle}/write`);
    await expect(page).toHaveURL(/\/login\?next=/);
    const me = await callApi(page.request, "GET", "/me");
    expect(me.status).toBe(401);
  });
});
