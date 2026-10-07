import { expect, test, type Page } from "@playwright/test";

import {
  adminAccount,
  callApi,
  logInWith,
  newGuestContext,
  requireAdmin,
  requireAdminTestSettings,
  requireBackend,
  uniqueVersion,
} from "./support/backend.js";

/**
 * 006 US4 릴리스 노트 편집(quickstart #30~#37, T060): 잘못된 버전·한국어판 비움 안내, 초안 저장 → 미리보기 → 게시 → 독자 화면
 * `/updates/v{version}`, 게시 뒤 버전 읽기 전용·삭제 없음, 같은 노트를 두 화면에서 차례로 저장하면 두 번째는 충돌 안내,
 * 게시 중단 → 독자 404, 작업 기록에 만들기·수정·게시·게시 중단, 게시한 적 없는 초안 삭제.
 * 버전은 `uniqueVersion()`(주 번호 900)이라 003 portal-us5의 "가장 새 버전"(주 번호 1000 이상)을 넘지 않는다.
 */
test.describe("006 US4 릴리스 노트 편집", () => {
  requireBackend();
  requireAdmin();
  requireAdminTestSettings();
  test.describe.configure({ mode: "serial" });

  const version = uniqueVersion();
  const noteTitle = `릴리스 ${version} 소식`;
  let notePath = "";

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logInWith(page, email, password);
  }

  test("잘못된 버전과 한국어판 비움은 입력 칸 옆 안내(AS2, #31)", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin/release-notes/new");
    await page.getByLabel("버전").fill("1.2");
    await page.getByRole("button", { name: "초안 저장" }).click();
    await expect(page.getByLabel("버전")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("제목 (한국어)")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#version-error")).not.toBeEmpty();
    // 입력은 그대로 남는다
    await expect(page.getByLabel("버전")).toHaveValue("1.2");
    await expect(page).toHaveURL(/\/admin\/release-notes\/new$/);
  });

  test("초안 저장 → 미리보기 → 게시 → 독자 화면, 게시 뒤 버전 읽기 전용·삭제 없음(AS1·AS3, #30·#32·#33)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    await page.goto("/admin/release-notes");
    await page.getByRole("link", { name: "새 노트" }).click();
    await page.getByLabel("버전").fill(version);
    await page.getByLabel("릴리스 날짜").fill("2026-10-07");
    await page.getByLabel("제목 (한국어)").fill(noteTitle);
    await page.getByLabel("본문(Markdown) (한국어)").fill("## 새 기능\n\n관리 콘솔이 생겼습니다.");
    await page.getByRole("button", { name: "초안 저장" }).click();
    await expect(page).toHaveURL(/\/admin\/release-notes\/\d+$/);
    notePath = new URL(page.url()).pathname;
    await expect(
      page.getByRole("heading", { level: 1, name: `릴리스 노트 ${version}` }),
    ).toBeVisible();

    await page.getByRole("button", { name: "미리보기 (한국어)" }).click();
    await expect(page.getByRole("heading", { name: "새 기능" })).toBeVisible();

    await page.getByLabel("게시를 확인했습니다").check();
    await page.getByRole("button", { name: "게시", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("게시했습니다.");
    await expect(page.getByLabel("버전")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: "삭제" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "게시 중단" })).toBeVisible();

    const reader = await page.request.get(`/updates/v${version}`);
    expect(reader.status()).toBe(200);
    await page.getByRole("link", { name: "독자에게 보기" }).click();
    await expect(page).toHaveURL(new RegExp(`/updates/v${version.replaceAll(".", "\\.")}$`));
    await expect(page.getByRole("heading", { name: noteTitle })).toBeVisible();

    await page.goto("/admin/release-notes?status=PUBLISHED");
    await expect(
      page.getByRole("table", { name: "릴리스 노트 목록" }).getByRole("link", { name: version }),
    ).toBeVisible();
  });

  test("같은 노트를 두 화면에서 차례로 저장하면 두 번째는 충돌 안내, 입력은 남는다(AS5, #34)", async ({
    page,
  }) => {
    await asAdmin(page);
    const other = await page.context().newPage();
    await page.goto(notePath);
    await other.goto(notePath);

    await page.getByLabel("제목 (한국어)").fill(`${noteTitle} (고침)`);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("저장했습니다.");

    const body = "## 새 기능\n\n다른 화면에서 고친 본문";
    await other.getByLabel("본문(Markdown) (한국어)").fill(body);
    await other.getByRole("button", { name: "저장", exact: true }).click();
    await expect(other.getByRole("alert")).toContainText("다른 관리자가 먼저 저장했습니다.");
    await expect(other.getByRole("link", { name: "최신 내용 열기" })).toBeVisible();
    await expect(other.getByLabel("본문(Markdown) (한국어)")).toHaveValue(body);
    await other.close();
  });

  test("게시 중단 → 독자 404, 작업 기록에 만들기·수정·게시·게시 중단(AS6, #35·#36)", async ({
    browser,
    page,
  }) => {
    await asAdmin(page);
    await page.goto(notePath);
    await page.getByLabel("게시 중단을 확인했습니다").check();
    await page.getByRole("button", { name: "게시 중단" }).click();
    await expect(page.getByRole("status")).toHaveText("게시를 중단했습니다.");

    const context = await newGuestContext(browser);
    const guest = await context.newPage();
    expect((await guest.goto(`/updates/v${version}`))?.status()).toBe(404);
    await context.close();

    await page.getByRole("link", { name: "이 노트의 작업 기록" }).click();
    const table = page.getByRole("table", { name: "작업 기록 목록" });
    for (const action of [
      "릴리스 노트 만들기",
      "릴리스 노트 수정",
      "릴리스 노트 게시",
      "릴리스 노트 게시 중단",
    ]) {
      await expect(table.getByRole("cell", { name: action, exact: true }), action).toHaveCount(1);
    }
  });

  test("한 번도 게시하지 않은 초안은 지울 수 있다(#37)", async ({ page }) => {
    await asAdmin(page);
    const draftVersion = uniqueVersion();
    await page.goto("/admin/release-notes/new");
    await page.getByLabel("버전").fill(draftVersion);
    await page.getByLabel("릴리스 날짜").fill("2026-10-07");
    await page.getByLabel("제목 (한국어)").fill(`지울 초안 ${draftVersion}`);
    await page.getByLabel("본문(Markdown) (한국어)").fill("곧 지웁니다.");
    await page.getByRole("button", { name: "초안 저장" }).click();
    await expect(page).toHaveURL(/\/admin\/release-notes\/\d+$/);
    const id = Number(new URL(page.url()).pathname.split("/").at(-1));

    await page.getByLabel("이 초안을 지우는 것을 확인했습니다").check();
    await page.getByRole("button", { name: "삭제" }).click();
    await expect(page).toHaveURL(/\/admin\/release-notes$/);
    await expect(page.getByRole("link", { name: draftVersion })).toHaveCount(0);
    expect((await callApi(page.request, "GET", `/admin/release-notes/${id}`)).status).toBe(404);
  });
});
