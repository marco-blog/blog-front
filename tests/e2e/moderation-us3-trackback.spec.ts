import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  callApi,
  logIn,
  logInWith,
  logOut,
  newAccount,
  newGuestContext,
  publishPost,
  report,
  requireAdmin,
  requireBackend,
  requireModerationTestSettings,
  sendTrackbackPing,
  setBlogSettings,
  signUp,
} from "./support/backend.js";

/**
 * 005 US3 트랙백(quickstart #29~#33, #36, #38~#39, #41, T097).
 * 받기: 외부 블로그 형식의 핑(UTF-8·EUC-KR)이 `error 0`으로 저장되어 글 상세 목록에 제목·요약·블로그 이름·링크로 보이고,
 * 같은 핑은 `Duplicate trackback`. 비공개 글·트랙백을 끈 블로그는 `Trackback is not allowed`. 주인이 관리 화면에서 지운
 * 트랙백을 다시 보내도 중복. 보내기: B가 발행 설정에 A 글의 트랙백 주소를 넣고 발행하면 A 글에 B 글 트랙백이 생기고 B의 결과는
 * "성공". 글 상세의 트랙백 주소와 RDF 자동 발견. 관리자가 있으면 트랙백 신고 → 숨김 → 목록에서 사라짐.
 */
test.describe("005 US3 트랙백", () => {
  requireBackend();
  requireModerationTestSettings();
  test.describe.configure({ mode: "serial" });

  const a = newAccount("ta");
  const b = newAccount("tb");
  const tag = a.handle.slice(-6);
  const externalUrl = `https://old-blog.example/${tag}/1`;
  const externalTitle = `외부 블로그 글 ${tag}`;
  const eucKrUrl = `http://euc-kr.example/${tag}`;
  let postA = 0;
  let privateA = 0;
  let postB = 0;
  let externalId = 0;

  const trackbackUrl = (page: Page, id: number) =>
    new URL(`/${a.handle}/${id}/trackback`, page.url()).toString();

  test("A 글에 외부 핑을 보내면 error 0, 글 상세 목록에 보이고, 같은 핑은 중복(#29·#30)", async ({
    page,
  }) => {
    await signUp(page, a);
    postA = await publishPost(page.request, a.handle, {
      title: `트랙백 받을 글 ${tag}`,
      contentMarkdown: "트랙백을 받는 글의 본문입니다.",
    });
    privateA = await publishPost(page.request, a.handle, {
      title: `비공개 글 ${tag}`,
      contentMarkdown: "비공개 글 본문입니다.",
      visibility: "PRIVATE",
    });

    const ping = {
      url: externalUrl,
      title: externalTitle,
      excerpt: "<p>옛 블로그에서 &amp; 보낸 요약입니다.</p>",
      blog_name: "옛 블로그",
    };
    const first = await sendTrackbackPing(page.request, a.handle, postA, ping);
    expect(first.status).toBe(200);
    expect(first.error).toBe(0);
    expect(first.xml).toContain('<?xml version="1.0" encoding="utf-8"?>');

    // EUC-KR 설치형 블로그 형식: 제목 "제목"(C1A6 B8F1) + 실행 표시
    const eucKr = Buffer.concat([
      Buffer.from(`url=${encodeURIComponent(eucKrUrl)}&title=`),
      Buffer.from([0xc1, 0xa6, 0xb8, 0xf1]),
      Buffer.from(`-${tag}&blog_name=euc`),
    ]);
    const second = await sendTrackbackPing(page.request, a.handle, postA, eucKr, "EUC-KR");
    expect(second.error).toBe(0);

    const again = await sendTrackbackPing(page.request, a.handle, postA, ping);
    expect(again.status).toBe(200);
    expect(again.error).toBe(1);
    expect(again.message).toBe("Duplicate trackback");

    const guest = await newGuestContext(page.context().browser()!);
    const guestPage = await guest.newPage();
    await guestPage.goto(`/${a.handle}/${postA}`);
    const list = guestPage.getByRole("list", { name: "받은 트랙백" });
    const item = list.getByRole("listitem").filter({ hasText: externalTitle });
    await expect(item.getByRole("link", { name: externalTitle })).toHaveAttribute(
      "href",
      externalUrl,
    );
    await expect(item.getByRole("link", { name: externalTitle })).toHaveAttribute(
      "rel",
      "nofollow ugc noopener",
    );
    await expect(item).toContainText("옛 블로그에서 & 보낸 요약입니다.");
    await expect(item).toContainText("옛 블로그");
    await expect(list).toContainText(`제목-${tag}`);
    externalId = Number((await item.getAttribute("id"))?.replace("trackback-", ""));
    expect(externalId).toBeGreaterThan(0);
    await guest.close();
  });

  test("비공개 글과 트랙백을 끈 블로그는 받지 않는다(#31, AS3)", async ({ page }) => {
    const toPrivate = await sendTrackbackPing(page.request, a.handle, privateA, {
      url: `https://x.example/${tag}/p`,
      title: "비공개 글에 핑",
    });
    expect(toPrivate.error).toBe(1);
    expect(toPrivate.message).toBe("Trackback is not allowed");

    const missing = await sendTrackbackPing(page.request, a.handle, postA, { title: "주소 없음" });
    expect(missing.message).toBe("Missing url");

    await logIn(page, a);
    await setBlogSettings(page.request, a.handle, { trackbackEnabled: false });
    const closed = await sendTrackbackPing(page.request, a.handle, postA, {
      url: `https://x.example/${tag}/closed`,
      title: "꺼진 블로그에 핑",
    });
    expect(closed.message).toBe("Trackback is not allowed");
    await page.goto(`/${a.handle}/${postA}`);
    await expect(page.getByText("트랙백을 받지 않는 글입니다.")).toBeVisible();

    // 설정 화면에서 다시 켠다
    await page.goto(`/${a.handle}/manage/settings`);
    const toggle = page.getByRole("checkbox", { name: "트랙백 받기" });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toHaveText("블로그 설정을 저장했습니다.");
  });

  test("글 상세에 트랙백 주소와 HTML 주석 RDF(#36, AS6)", async ({ page }) => {
    await page.goto(`/${a.handle}/${postA}`);
    const address = page.getByLabel("트랙백 주소");
    await expect(address).toHaveValue(trackbackUrl(page, postA));

    const html = await (await page.request.get(`/${a.handle}/${postA}`)).text();
    expect(html).toMatch(/<!--\s*<rdf:RDF/);
    expect(html).toContain(`trackback:ping="${trackbackUrl(page, postA)}"`);
    expect(html).toContain(`dc:identifier="${new URL(`/${a.handle}/${postA}`, page.url())}"`);
  });

  test("B가 발행 설정에 A 글 트랙백 주소를 넣고 발행하면 A 글에 B 글 트랙백, 결과는 성공(#32·#33)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await logOut(page);
    await signUp(page, b);
    await page.goto("/write");
    const titleB = `트랙백 보내는 글 ${tag}`;
    await page.getByLabel("제목").fill(titleB);
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("A 글에 트랙백을 보냅니다.");
    await page.getByRole("button", { name: "완료" }).click();
    const dialog = page.getByRole("dialog", { name: "발행 설정" });
    await dialog.getByLabel("트랙백 보내기").fill(trackbackUrl(page, postA));
    await dialog.getByRole("button", { name: "공개 발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/${b.handle}/\\d+$`));
    postB = Number(new URL(page.url()).pathname.split("/").pop());

    // 보내기는 커밋 뒤 따로 돈다. 결과가 나올 때까지 기다린다.
    await expect
      .poll(
        async () =>
          (
            await callApi<{ status: string }[]>(
              page.request,
              "GET",
              `/posts/${postB}/trackback-pings`,
            )
          ).body.result[0]?.status,
        { timeout: 30_000 },
      )
      .toBe("SUCCESS");

    await page.goto(`/${b.handle}/manage/posts`);
    const row = page.getByRole("listitem").filter({ hasText: titleB });
    await row.getByText("트랙백 결과").click();
    await expect(row.getByRole("list", { name: "보낸 트랙백" })).toContainText(
      `${trackbackUrl(page, postA)} 성공`,
    );

    await page.goto(`/${a.handle}/${postA}`);
    const item = page
      .getByRole("list", { name: "받은 트랙백" })
      .getByRole("listitem")
      .filter({ hasText: titleB });
    await expect(item.getByRole("link", { name: titleB })).toHaveAttribute(
      "href",
      new URL(`/${b.handle}/${postB}`, page.url()).toString(),
    );
  });

  test("A가 관리 화면에서 지운 트랙백을 다시 보내도 중복(#38·#39, AS4)", async ({ page }) => {
    await logOut(page);
    await logIn(page, a);
    await page.goto(`/${a.handle}/manage/trackbacks`);
    await expect(page.getByText("트랙백을 받고 있습니다.")).toBeVisible();
    const item = page
      .getByRole("list", { name: "받은 트랙백 목록" })
      .getByRole("listitem")
      .filter({ hasText: externalTitle });
    page.once("dialog", (dialog) => void dialog.accept());
    await item.getByRole("button", { name: `트랙백 삭제: ${externalTitle}` }).click();
    await expect(page.getByRole("status")).toHaveText("트랙백을 삭제했습니다.");
    await expect(page.getByText(externalTitle)).toHaveCount(0);

    const again = await sendTrackbackPing(page.request, a.handle, postA, {
      url: externalUrl,
      title: externalTitle,
    });
    expect(again.message).toBe("Duplicate trackback");
    await page.goto(`/${a.handle}/${postA}`);
    await expect(page.getByText(externalTitle)).toHaveCount(0);
  });

  test("관리자가 신고된 트랙백을 숨기면 글 상세 목록에서 사라진다(#41)", async ({ page }) => {
    requireAdmin();
    const title = `신고될 트랙백 ${tag}`;
    const ping = await sendTrackbackPing(page.request, a.handle, postA, {
      url: `https://spam.example/${tag}`,
      title,
      excerpt: "광고 트랙백입니다.",
    });
    expect(ping.error).toBe(0);

    await logOut(page);
    await logIn(page, b);
    await page.goto(`/${a.handle}/${postA}`);
    const item = page.getByRole("list", { name: "받은 트랙백" }).getByRole("listitem").filter({
      hasText: title,
    });
    const id = Number((await item.getAttribute("id"))?.replace("trackback-", ""));
    const reported = await report(page.request, "TRACKBACK", id);
    expect(reported.status).toBe(201);

    const { email, password } = adminAccount();
    await logOut(page);
    await logInWith(page, email, password);
    await page.goto("/admin/reports?targetType=TRACKBACK");
    const row = page
      .getByRole("table", { name: "신고 목록" })
      .getByRole("row")
      .filter({ hasText: title });
    await row.getByRole("link", { name: /^신고 \d+건$/ }).click();
    await page.getByRole("button", { name: "숨김", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("신고 1건을 처리했습니다.");

    const guest = await newGuestContext(page.context().browser()!);
    const guestPage = await guest.newPage();
    await guestPage.goto(`/${a.handle}/${postA}`);
    await expect(guestPage.getByRole("list", { name: "받은 트랙백" })).toBeVisible();
    await expect(guestPage.getByText(title)).toHaveCount(0);
    await guest.close();

    // 주인의 관리 화면에는 "숨김"으로 남고 지울 수 없다
    await logOut(page);
    await logIn(page, a);
    await page.goto(`/${a.handle}/manage/trackbacks`);
    const hidden = page
      .getByRole("list", { name: "받은 트랙백 목록" })
      .getByRole("listitem")
      .filter({ hasText: title });
    await expect(hidden).toContainText("관리자가 숨긴 트랙백은 삭제할 수 없습니다.");
    await expect(hidden.getByRole("button")).toHaveCount(0);
  });
});
