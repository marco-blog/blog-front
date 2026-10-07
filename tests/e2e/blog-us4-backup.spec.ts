import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { newAccount, publishPost, requireBackend, signUp } from "./support/backend.js";

/**
 * 004 US4 백업 Independent Test(quickstart #31~33, T106): 글·이미지가 있는 블로그에서 백업을 요청하면 배치 작업이 zip을 만들고
 * (90초 안), 알림이 오고, 내려받은 파일은 zip(앞 2바이트 `PK`)이다. 같은 날 다시 요청하면 하루 한 번 안내.
 * backend가 있어야 돈다(E2E_BACKEND_URL). backend는 BLOG_EXPORT_DIR(local 프로필 기본 ./data/exports)에 파일을 쓴다.
 */

/** 120x80 PNG(us4-images와 같은 그림) */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAn0lEQVR42u3QAQkAAAzDsMu5fz0TcxsfBCqgZLJbV+FyBjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBgwYNGjRo0KBBg/7TAQc09IbxUPQzAAAAAElFTkSuQmCC",
  "base64",
);
test.describe("004 US4 백업", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("ba");

  test("백업을 만들면 알림이 오고 zip을 내려받는다. 다시 요청하면 하루 한 번 안내", async ({
    page,
  }) => {
    // 백업 생성 작업 주기(30초) + 화면 새로 고침 주기(30초) + 여유
    test.setTimeout(180_000);
    await signUp(page, owner);
    const origin = new URL(test.info().project.use.baseURL ?? "").origin;
    const uploaded = await page.request.post("/api/v1/media", {
      headers: { Origin: origin },
      multipart: {
        file: { name: "image.png", mimeType: "image/png", buffer: PNG },
        purpose: "POST",
      },
    });
    expect(uploaded.status()).toBe(201);
    const { key } = ((await uploaded.json()) as { result: { key: string } }).result;
    await publishPost(page.request, owner.handle, {
      title: "백업할 글",
      contentMarkdown: `백업할 본문\n\n![점](/media/${key})`,
    });

    await page.goto(`/${owner.handle}/manage`);
    await page
      .getByRole("navigation", { name: "블로그 관리 메뉴" })
      .getByRole("link", { name: "백업" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage/backup$`));
    await expect(page.getByText("아직 만든 백업이 없습니다.")).toBeVisible();

    await page.getByRole("button", { name: "백업 만들기" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "백업을 요청했습니다. 준비되면 알림으로 알려 드립니다.",
    );
    const recent = page.getByRole("list", { name: "최근 백업" });
    await expect(recent).toBeVisible();

    // 화면이 30초마다 다시 읽지만, 기다리는 동안 새로 고쳐 바로 확인한다.
    const download = recent.getByRole("link", { name: "내려받기" });
    await expect
      .poll(
        async () => {
          await page.reload();
          return download.count();
        },
        { timeout: 120_000, intervals: [3_000, 5_000] },
      )
      .toBe(1);
    await expect(recent).toContainText("완료");

    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
    expect(file.suggestedFilename()).toMatch(/\.zip$/);
    const bytes = await readFile(await file.path());
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");

    await page.goto("/notifications");
    const notifications = page.getByRole("list", { name: "알림 목록" });
    await expect(notifications).toContainText("백업이 준비되었습니다.");
    await notifications.getByRole("button", { name: /백업이 준비되었습니다/ }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage/backup$`));

    await page.getByRole("button", { name: "백업 만들기" }).click();
    await expect(page.getByRole("alert")).toHaveText("백업은 하루에 한 번만 만들 수 있습니다.");
  });

  test("남의 백업 파일과 백업 화면은 볼 수 없다", async ({ page }) => {
    const other = newAccount("bb");
    await signUp(page, other);
    const screen = await page.goto(`/${owner.handle}/manage/backup`);
    expect(screen?.status()).toBe(404);
    const list = await page.request.get(`/api/v1/blogs/${owner.handle}/exports`);
    expect(list.status()).toBe(403);
  });
});
