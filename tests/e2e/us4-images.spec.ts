import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { logIn, logOut, newAccount, requireBackend, signUp } from "./support/backend.js";

/**
 * US4 글에 이미지 넣기 Independent Test(T211, quickstart #12~15, #23~25): 글 작성 화면에서 이미지를 붙여 넣어 올리고
 * 본문에 넣은 뒤 발행하면 방문자 화면에서 보인다. 11MB·가짜 jpg는 거부, 남의 TEMP는 404, 썸네일은 허용 목록만.
 * 프로필 이미지·블로그 대표 이미지도 올려 저장한다. backend가 있어야 돈다(E2E_BACKEND_URL).
 * backend에 이미지 기능이 아직 없으면(GET /media/{key}가 MEDIA_NOT_FOUND가 아니면) 건너뛴다.
 */

/** 120x80 PNG(왼쪽 빨강, 오른쪽 파랑) */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAn0lEQVR42u3QAQkAAAzDsMu5fz0TcxsfBCqgZLJbV+FyBjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBg/7TAQc09IbxUPQzAAAAAElFTkSuQmCC",
  "base64",
);
const MEDIA_SRC = /^\/media\/([0-9A-Za-z]{22})$/;

interface Envelope<T> {
  header: { isSuccessful: boolean; resultCode: string };
  result: T;
}
interface Uploaded {
  key: string;
  url: string;
  mime: string;
  width: number;
  height: number;
}

function origin(): string {
  return new URL(test.info().project.use.baseURL ?? "").origin;
}

/** front 서버의 /api 프록시를 거쳐 multipart로 올린다. */
async function upload(
  request: APIRequestContext,
  file: { name: string; mimeType: string; buffer: Buffer },
  purpose = "POST",
): Promise<{ status: number; body: Envelope<Uploaded> }> {
  const response = await request.post("/api/v1/media", {
    headers: { Origin: origin() },
    multipart: { file, purpose },
  });
  return { status: response.status(), body: (await response.json()) as Envelope<Uploaded> };
}

/**
 * 에디터에 이미지 파일을 붙여 넣는다(브라우저의 붙여넣기 이벤트와 같다). e2e 타입 설정에는 DOM 타입이 없으므로
 * 브라우저에서 돌 코드를 문자열로 넘긴다.
 */
async function pasteImage(page: Page, base64: string) {
  await page.locator(".ProseMirror").click();
  await page.evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (char) => char.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
    const event = new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true });
    document.querySelector(".ProseMirror").dispatchEvent(event);
  })()`);
}

async function naturalWidth(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .first()
    .evaluate((image) => (image as unknown as { naturalWidth: number }).naturalWidth);
}

test.describe("US4 이미지", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("ia");
  const other = newAccount("ib");
  let postPath = "";
  let imageKey = "";

  test.beforeAll(async ({ request }) => {
    const response = await request.get("/media/AAAAAAAAAAAAAAAAAAAAAA");
    const body = (await response.json().catch(() => null)) as Envelope<null> | null;
    test.skip(
      body?.header.resultCode !== "MEDIA_NOT_FOUND",
      "backend에 이미지 기능(US4)이 아직 없다.",
    );
  });

  test("에디터에 붙여 넣은 이미지를 올려 본문에 넣고, 대표 이미지로 발행하면 방문자에게 보인다 (#13)", async ({
    page,
  }) => {
    await signUp(page, owner);
    await page.goto(`/${owner.handle}/write`);
    await page.getByLabel("제목").fill("그림이 있는 글");
    await expect(page.locator(".ProseMirror")).toBeVisible();
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("사진 아래에 글을 씁니다.");

    const uploaded = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/media") && response.request().method() === "POST",
    );
    await pasteImage(page, PNG.toString("base64"));
    const response = await uploaded;
    expect(response.status()).toBe(201);
    const result = ((await response.json()) as Envelope<Uploaded>).result;
    expect(result).toMatchObject({ mime: "image/png", width: 120, height: 80 });
    imageKey = result.key;
    const inEditor = page.locator(`.ProseMirror img[src="/media/${imageKey}"]`);
    await expect(inEditor).toHaveCount(1);

    await page.getByRole("button", { name: "완료" }).click();
    const dialog = page.getByRole("dialog", { name: "발행 설정" });
    const thumbnail = dialog.getByRole("group", { name: "대표 이미지" });
    await expect(thumbnail.getByRole("radio", { name: "본문 1번째 이미지" })).toBeChecked();
    await dialog.getByRole("button", { name: "공개 발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/\\d+$`));
    postPath = new URL(page.url()).pathname;

    await logOut(page);
    await page.goto(postPath);
    const image = page.locator("article img").first();
    await expect(image).toHaveAttribute("src", MEDIA_SRC);
    expect(MEDIA_SRC.exec((await image.getAttribute("src")) ?? "")?.[1]).toBe(imageKey);
    await expect.poll(() => naturalWidth(page, "article img")).toBe(120);

    const original = await page.request.get(`/media/${imageKey}`);
    expect(original.status()).toBe(200);
    expect(original.headers()["content-type"]).toBe("image/png");
    expect(original.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(original.headers()["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(await original.body(), PNG)).toBe(0);
  });

  test("썸네일: 글 카드는 300x200(2배 srcset), og:image는 1200x630, 허용 목록 밖은 400 (#23)", async ({
    page,
  }) => {
    await page.goto(`/${owner.handle}`);
    const card = page.locator("img.post-thumbnail").first();
    await expect(card).toHaveAttribute("src", `/media/${imageKey}/300x200`);
    await expect(card).toHaveAttribute(
      "srcset",
      `/media/${imageKey}/300x200 1x, /media/${imageKey}/600x400 2x`,
    );
    // 원본(120x80)보다 크게 늘리지 않는다: 비율 3:2로 원본 안에서 자른 결과
    await expect.poll(() => naturalWidth(page, "img.post-thumbnail")).toBe(120);

    await page.goto(postPath);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      new RegExp(`/media/${imageKey}/1200x630$`),
    );

    const thumb = await page.request.get(`/media/${imageKey}/300x200?fit=contain`);
    expect(thumb.status()).toBe(200);
    expect(thumb.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    const odd = await page.request.get(`/media/${imageKey}/123x45`);
    expect(odd.status()).toBe(400);
    expect(((await odd.json()) as Envelope<null>).header.resultCode).toBe(
      "THUMBNAIL_SIZE_NOT_ALLOWED",
    );
  });

  test("11MB 이미지와 이름만 jpg인 파일은 거부된다 (#15)", async ({ page }) => {
    await logIn(page, owner);
    const big = Buffer.alloc(11 * 1024 * 1024);
    PNG.copy(big);
    const tooLarge = await upload(page.request, {
      name: "big.png",
      mimeType: "image/png",
      buffer: big,
    });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.header.resultCode).toBe("MEDIA_TOO_LARGE");

    const fake = { name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a jpeg") };
    const fakeJpeg = await upload(page.request, fake);
    expect(fakeJpeg.status).toBe(415);
    expect(fakeJpeg.body.header.resultCode).toBe("MEDIA_TYPE_NOT_ALLOWED");

    await page.goto("/settings/profile");
    const chooser = page.getByLabel("이미지 파일 고르기");
    await chooser.setInputFiles({ name: "big.png", mimeType: "image/png", buffer: big });
    await expect(page.getByText("이미지는 10MB 이하만 올릴 수 있습니다.")).toBeVisible();
    await chooser.setInputFiles(fake);
    await expect(page.getByText("JPEG, PNG, GIF, WebP 이미지만 올릴 수 있습니다.")).toBeVisible();
  });

  test("저장하지 않은 이미지(TEMP)는 올린 회원에게만 보이고, 다른 회원·비로그인에게는 404 (#24)", async ({
    page,
  }) => {
    await logIn(page, owner);
    const temp = await upload(page.request, {
      name: "temp.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    expect(temp.status).toBe(201);
    const key = temp.body.result.key;
    expect(key).toMatch(/^[0-9A-Za-z]{22}$/);
    const mine = await page.request.get(`/media/${key}`);
    expect(mine.status()).toBe(200);
    expect(mine.headers()["cache-control"]).toBe("private, no-store");

    await logOut(page);
    const anonymous = await page.request.get(`/media/${key}`);
    expect(anonymous.status()).toBe(404);
    expect(((await anonymous.json()) as Envelope<null>).header.resultCode).toBe("MEDIA_NOT_FOUND");

    await signUp(page, other);
    const stranger = await page.request.get(`/media/${key}`);
    expect(stranger.status()).toBe(404);
    expect((await page.request.get(`/media/${key}/300x200`)).status()).toBe(404);
  });

  test("프로필 이미지와 블로그 대표 이미지를 올려 저장하면 블로그 홈에 보인다 (#25)", async ({
    page,
  }) => {
    await logIn(page, owner);
    await page.goto("/settings/profile");
    await page.getByLabel("이미지 파일 고르기").setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("img", { name: "프로필 이미지 미리보기" })).toBeVisible();
    await page.getByRole("button", { name: "저장" }).first().click();
    await expect(page.getByText("프로필을 저장했습니다.")).toBeVisible();

    await page.goto(`/${owner.handle}/manage/settings`);
    await page.getByLabel("이미지 파일 고르기").setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByRole("img", { name: "블로그 대표 이미지 미리보기" })).toBeVisible();
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("블로그 설정을 저장했습니다.")).toBeVisible();

    await logOut(page);
    await page.goto(`/${owner.handle}`);
    await expect(page.locator("img.blog-cover")).toHaveAttribute(
      "src",
      /^\/media\/[0-9A-Za-z]{22}\/600x400$/,
    );
    await expect(page.locator("header img.avatar")).toHaveAttribute(
      "src",
      /^\/media\/[0-9A-Za-z]{22}\/100x100$/,
    );
    await expect.poll(() => naturalWidth(page, "img.blog-cover")).toBeGreaterThan(0);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/media\/[0-9A-Za-z]{22}\/1200x630$/,
    );
  });
});
