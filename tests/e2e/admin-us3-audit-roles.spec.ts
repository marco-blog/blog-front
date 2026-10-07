import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  adminAccount,
  callApi,
  logInWith,
  myUserId,
  newAccount,
  newGuestContext,
  requireAdmin,
  requireAdminTestSettings,
  requireBackend,
  signUp,
} from "./support/backend.js";

/**
 * front 작업 이름표의 코드(`app/admin/auditActions.ts`의 `AUDIT_ACTION_GROUPS`). e2e 타입 설정은 app 파일을 포함하지 않으므로
 * 원본을 읽어 대문자 코드만 꺼낸다.
 */
function frontAuditActions(): string[] {
  const source = readFileSync(
    join(import.meta.dirname, "../../app/admin/auditActions.ts"),
    "utf-8",
  );
  const groups = source.slice(
    source.indexOf("export const AUDIT_ACTION_GROUPS"),
    source.indexOf("export type AuditActionGroup"),
  );
  return [...groups.matchAll(/"([A-Z][A-Z_]+)"/g)].map((match) => match[1]);
}

/**
 * 006 US3 작업 기록·관리자 권한(quickstart #21~#27, T049): 관리자가 실행마다 고유한 소분류를 만들고 숨기고, 새 회원의 블로그 한도를
 * 바꾸면 `/admin/audit-log`에서 작업 종류·대상으로 걸러 그 기록과 변경 전후 값이 보인다. 기록은 고칠 수 없다(405).
 * 최고 관리자가 새 회원 B에게 ADMIN을 주면 B에게 "시스템 관리"가 보이고, B는 권한을 바꿀 수 없다(403). 회수하면 B의 콘솔은 404.
 * 자기 권한 변경은 422. **CI 관리자 자신의 권한이 바뀌는 요청은 보내지 않는다**(결정 표 25번).
 */
test.describe("006 US3 작업 기록·관리자 권한", () => {
  requireBackend();
  requireAdmin();
  requireAdminTestSettings();
  test.describe.configure({ mode: "serial" });

  const member = newAccount("ar");
  const helper = newAccount("as");
  const run = member.handle.slice(-6);
  const topicName = `기록주제${run}`;
  const topicSlug = `e2e-audit-${run}`;
  let memberId = 0;
  let helperId = 0;

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logInWith(page, email, password);
  }

  async function topicIdBySlugAsAdmin(request: APIRequestContext, slug: string) {
    const response = await callApi<unknown>(request, "GET", "/admin/topics");
    expect(response.status).toBe(200);
    const find = (nodes: unknown): number | null => {
      if (!Array.isArray(nodes)) {
        return null;
      }
      for (const node of nodes as { id: number; slug: string; children?: unknown }[]) {
        if (node.slug === slug) {
          return node.id;
        }
        const child = find(node.children);
        if (child !== null) {
          return child;
        }
      }
      return null;
    };
    const result = response.body.result as unknown;
    const id = find(
      Array.isArray(result) ? result : (result as { topics?: unknown } | null)?.topics,
    );
    expect(id, `topic ${slug}`).not.toBeNull();
    return id as number;
  }

  /** 작업 기록을 대상 종류·번호와 작업 종류(이름)로 거른다 */
  async function filterAudit(page: Page, targetType: string, targetId: number, action: string) {
    await page.goto("/admin/audit-log");
    const form = page.getByRole("search", { name: "거르기" });
    await form.getByLabel("작업 종류").selectOption({ label: action });
    await form.getByLabel("대상 종류").selectOption({ label: targetType });
    await form.getByLabel("대상 번호").fill(String(targetId));
    await form.getByRole("button", { name: "거르기" }).click();
    await expect(page).toHaveURL(new RegExp(`targetId=${targetId}`));
    return page.getByRole("table", { name: "작업 기록 목록" });
  }

  test("소분류 추가·숨김과 블로그 한도 변경이 작업 기록에 변경 전후 값과 함께, 기록 수정은 405(AS1·AS2, #21~#23)", async ({
    browser,
    page,
  }) => {
    test.setTimeout(120_000);
    const context = await newGuestContext(browser);
    const memberPage = await context.newPage();
    await signUp(memberPage, member);
    memberId = await myUserId(memberPage.request);
    await context.close();

    await asAdmin(page);
    await page.goto("/admin/topics");
    const create = page.getByRole("group", { name: "주제 추가" });
    await create.getByLabel("위치").selectOption({ label: "라이프" });
    await create.getByLabel("주소(slug)").fill(topicSlug);
    for (const label of ["이름(한국어)", "이름(English)", "이름(日本語)", "이름(简体中文)"]) {
      await create.getByLabel(label).fill(topicName);
    }
    await create.getByRole("button", { name: "추가" }).click();
    await expect(page.getByRole("status")).toHaveText("주제를 추가했습니다.");
    await page
      .getByRole("region", { name: topicName })
      .getByRole("button", { name: "숨기기" })
      .click();
    await expect(page.getByRole("status")).toHaveText("주제를 숨겼습니다.");
    const topicId = await topicIdBySlugAsAdmin(page.request, topicSlug);

    await page.goto(`/admin/users/${memberId}`);
    const limit = page.getByRole("group", { name: "블로그 수 한도" });
    await limit.getByLabel("한도").fill("5");
    await limit.getByRole("button", { name: "저장" }).click();
    await expect(page.getByRole("status")).toBeVisible();

    const created = await filterAudit(page, "주제", topicId, "주제 추가");
    await expect(created.getByRole("row")).toHaveCount(3); // 머리글 + 요약 줄 + 펼침 줄
    await expect(created).toContainText(`주제 #${topicId}`);
    await created.getByText("변경 내용").click();
    await expect(created).toContainText(topicSlug);

    const hidden = await filterAudit(page, "주제", topicId, "주제 숨김");
    await expect(hidden.getByRole("row")).toHaveCount(3);

    const changed = await filterAudit(page, "회원", memberId, "블로그 수 한도 변경");
    await expect(changed.getByRole("row")).toHaveCount(3);
    await changed.getByText("변경 내용").click();
    await expect(changed).toContainText("5");
    const detail = changed.getByRole("link", { name: "자세히" });
    const entryId = Number((await detail.getAttribute("href"))?.split("/").at(-1));
    expect(entryId).toBeGreaterThan(0);

    // 작업 기록은 고치거나 지울 수 없다(FR-107)
    for (const method of ["PUT", "PATCH", "DELETE"] as const) {
      const response = await callApi(page.request, method, `/admin/audit-logs/${entryId}`, {
        reason: "고침",
      });
      expect(response.status, method).toBe(405);
    }
    await detail.click();
    await expect(
      page.getByRole("heading", { level: 1, name: `작업 기록 ${entryId}` }),
    ).toBeVisible();
    await expect(page.getByText("요청 IP")).toBeVisible();
  });

  test("최고 관리자가 B에게 관리자 권한 부여 → B에게 시스템 관리, B는 권한 변경 403 → 회수 → B의 콘솔 404, 기록에 부여·회수(AS3, #24~#26)", async ({
    browser,
    page,
  }) => {
    test.setTimeout(120_000);
    const context = await newGuestContext(browser);
    const b = await context.newPage();
    await signUp(b, helper);
    helperId = await myUserId(b.request);

    await asAdmin(page);
    await page.goto("/admin/admins");
    const grant = page.getByRole("group", { name: "회원 번호로 관리자 지정" });
    await grant.getByLabel("회원 번호").fill(String(helperId));
    await grant.getByLabel("새 권한").selectOption({ label: "관리자" });
    await grant.getByLabel("권한을 바꾸는 것을 확인했습니다").check();
    await grant.getByRole("button", { name: "지정" }).click();
    await expect(page.getByRole("status")).toContainText("관리자");
    const row = page.getByRole("table", { name: "관리자 목록" }).getByRole("row", {
      name: new RegExp(helper.nickname),
    });
    await expect(row).toContainText("관리자");

    await b.goto("/");
    await b
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "시스템 관리" })
      .click();
    await expect(b).toHaveURL(/\/admin$/);
    await expect(b.getByRole("heading", { level: 1, name: "대시보드" })).toBeVisible();
    // ADMIN은 권한을 바꿀 수 없다(최고 관리자만)
    const denied = await callApi(b.request, "PUT", `/admin/users/${memberId}/role`, {
      role: "ADMIN",
    });
    expect(denied.status).toBe(403);

    const revoke = row.getByRole("group", { name: `${helper.nickname} 권한 바꾸기` });
    await revoke.getByLabel("새 권한").selectOption({ label: "회원" });
    await revoke.getByLabel("권한을 바꾸는 것을 확인했습니다").check();
    await revoke.getByRole("button", { name: "바꾸기" }).click();
    await expect(page.getByRole("status")).toContainText("회원");
    await expect(
      page.getByRole("table", { name: "관리자 목록" }).getByRole("row", {
        name: new RegExp(helper.nickname),
      }),
    ).toHaveCount(0);

    expect((await b.goto("/admin"))?.status()).toBe(404);
    await b.goto("/");
    await expect(
      b.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "시스템 관리" }),
    ).toHaveCount(0);
    await context.close();

    for (const action of ["관리자 권한 부여", "관리자 권한 회수"]) {
      const table = await filterAudit(page, "회원", helperId, action);
      await expect(table.getByRole("row"), action).toHaveCount(3);
    }
  });

  test("자기 권한 변경은 422 안내(같은 권한을 보내 실제로는 바뀌지 않는다, #27)", async ({
    page,
  }) => {
    await asAdmin(page);
    const me = await myUserId(page.request);
    await page.goto("/admin/admins");
    const grant = page.getByRole("group", { name: "회원 번호로 관리자 지정" });
    await grant.getByLabel("회원 번호").fill(String(me));
    await grant.getByLabel("새 권한").selectOption({ label: "최고 관리자" });
    await grant.getByLabel("권한을 바꾸는 것을 확인했습니다").check();
    await grant.getByRole("button", { name: "지정" }).click();
    await expect(page.getByRole("alert")).toContainText("자기 권한은 바꿀 수 없습니다.");
    const role = await callApi<{ role: string }>(page.request, "GET", "/me");
    expect(role.body.result.role).toBe("SUPER_ADMIN");
  });

  test("backend 작업 종류 목록이 front 이름표와 같다", async ({ page }) => {
    await asAdmin(page);
    const response = await callApi<{ actions: string[]; targetTypes: string[] }>(
      page.request,
      "GET",
      "/admin/audit-logs/actions",
    );
    expect(response.status).toBe(200);
    expect([...response.body.result.actions].sort()).toEqual(frontAuditActions().sort());
  });

  test.afterAll(async ({ browser }) => {
    // 실패로 중간에 멈췄을 때 B의 권한이 남지 않게(CI 관리자 자신은 건드리지 않는다)
    if (!helperId) {
      return;
    }
    const page = await browser.newPage();
    await asAdmin(page);
    const admins = await callApi<{ userId: number }[]>(page.request, "GET", "/admin/admins");
    if ((admins.body.result ?? []).some((admin) => admin.userId === helperId)) {
      await callApi(page.request, "PUT", `/admin/users/${helperId}/role`, { role: "USER" });
    }
    await page.close();
  });
});
