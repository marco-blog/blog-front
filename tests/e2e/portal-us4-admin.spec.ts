import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import {
  adminAccount,
  callApi,
  logIn,
  logInWith,
  logOut,
  newAccount,
  portalText,
  publishPost,
  requireAdmin,
  requireBackend,
  requirePortalTestSettings,
  signUp,
  topicIdBySlug,
} from "./support/backend.js";

/**
 * 003 US4 관리자 콘솔(quickstart #22~30, T093): 일반 회원은 `/admin`이 404, 관리자는 주제 관리로. 추천 3편을 순서대로
 * 지정하면 메인 맨 위에 그 순서로, 기간을 과거로 고치면 사라진다. 기간이 겹치는 6번째 추천은 409. 포털 제외는 포털에서만
 * 빠지고 해제하면 돌아온다. 주제 이름·숨김은 글쓰기 주제 목록과 주제 주소에 바로 반영된다. 설정 "기본값으로".
 * 공용 DB를 쓰므로 만든 추천·제외·설정·주제 변경은 끝에서 되돌린다.
 */
test.describe("003 US4 관리자 콘솔", () => {
  requireBackend();
  requirePortalTestSettings();
  requireAdmin();
  test.describe.configure({ mode: "serial" });

  const writer = newAccount("pm");
  const member = newAccount("pn");
  const run = writer.handle.slice(-6);
  const titles = [1, 2, 3].map((n) => `추천${run} ${n}번 글`);
  const ids: number[] = [];
  const curationIds: number[] = [];

  async function asAdmin(page: Page) {
    const { email, password } = adminAccount();
    await logOut(page);
    await logInWith(page, email, password);
  }

  async function createCuration(
    request: APIRequestContext,
    postId: number,
    startsAt: string,
    endsAt: string,
    sortOrder: number,
  ) {
    const created = await callApi<{ id: number }>(request, "POST", "/admin/portal/curations", {
      postId,
      startsAt,
      endsAt,
      sortOrder,
    });
    if (created.status === 201) {
      curationIds.push(created.body.result.id);
    }
    return created;
  }

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await asAdmin(page);
    for (const id of curationIds) {
      await callApi(page.request, "DELETE", `/admin/portal/curations/${id}`);
    }
    for (const postId of ids) {
      await callApi(page.request, "DELETE", `/admin/portal/exclusions/${postId}`);
    }
    await callApi(page.request, "DELETE", "/admin/settings/portal.min-content-length");
    const camping = await topicIdBySlug(page.request, "camping-hiking");
    const golf = await topicIdBySlug(page.request, "golf").catch(() => null);
    await callApi(page.request, "PATCH", `/admin/topics/${camping}`, {
      names: {
        ko: "캠핑·등산",
        en: "Camping & Hiking",
        ja: "キャンプ・登山",
        "zh-CN": "露营·登山",
      },
    });
    if (golf === null) {
      const tree = await callApi<
        Array<{ slug: string; id: number; children: { slug: string; id: number }[] }>
      >(page.request, "GET", "/admin/topics");
      const hidden = tree.body.result.flatMap((m) => m.children).find((t) => t.slug === "golf");
      if (hidden) {
        await callApi(page.request, "PATCH", `/admin/topics/${hidden.id}`, { adminHidden: false });
      }
    }
    await page.close();
  });

  test("일반 회원은 /admin 404·API 404 NOT_FOUND, 관리자는 주제 관리로(#22)", async ({ page }) => {
    test.setTimeout(90_000);
    await signUp(page, member);
    const denied = await page.goto("/admin");
    expect(denied?.status()).toBe(404);
    const api = await callApi(page.request, "GET", "/admin/topics");
    expect(api.status).toBe(404);
    expect(api.body.header.resultCode).toBe("NOT_FOUND");

    // 추천 영역도 블로그당 2편까지라 세 번째 글은 다른 블로그(member)에 쓴다.
    const third = await publishPost(page.request, member.handle, {
      title: titles[2],
      contentMarkdown: portalText(4, titles[2]),
    });
    await logOut(page);
    await signUp(page, writer);
    for (const title of titles.slice(0, 2)) {
      ids.push(
        await publishPost(page.request, writer.handle, {
          title,
          contentMarkdown: portalText(4, title),
        }),
      );
    }
    ids.push(third);

    await asAdmin(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/topics$/);
    await expect(page.getByRole("heading", { level: 1, name: "주제 관리" })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
    await expect(
      page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link"),
    ).toHaveText([
      "주제",
      "포털 추천",
      "포털 제외",
      "포털 설정",
      // 005: 회원·신고·숨긴 글. 신고 관리에는 처리 대기 배지가 붙을 수 있다.
      "회원 관리",
      /^신고 관리/,
      "숨긴 글",
    ]);
  });

  test("추천 3편을 순서 2·1·3으로 지정하면 메인 맨 위에 1·2·3 순서, 기간을 과거로 고치면 빠진다(#23, #26)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    const now = Date.now();
    const starts = new Date(now - 60_000).toISOString();
    const ends = new Date(now + 24 * 3_600_000).toISOString();

    // 첫 추천은 콘솔 화면으로: 글 주소로 확인 → 기간·순서
    await page.goto("/admin/portal/curations");
    await page.getByLabel("글 주소 또는 번호").fill(`/${writer.handle}/${ids[0]}`);
    await page.getByRole("button", { name: "글 확인" }).click();
    const found = page.getByRole("region", { name: "확인한 글" });
    await expect(found).toContainText("포털에 노출할 수 있는 글입니다.");
    await found.getByLabel("시작").fill("2020-01-01T00:00");
    await found.getByLabel("종료").fill("2099-01-01T00:00");
    await found.getByLabel("순서").fill("2");
    await found.getByRole("button", { name: "추천 추가" }).click();
    await expect(page.getByRole("status")).toHaveText("추천을 추가했습니다.");
    const listed = await callApi<Array<{ id: number; post: { id: number } }>>(
      page.request,
      "GET",
      "/admin/portal/curations?status=ACTIVE&size=100",
    );
    const consoleCreated = listed.body.result.find((c) => c.post.id === ids[0]);
    expect(consoleCreated).toBeTruthy();
    curationIds.push(consoleCreated!.id);

    expect((await createCuration(page.request, ids[1], starts, ends, 1)).status).toBe(201);
    expect((await createCuration(page.request, ids[2], starts, ends, 3)).status).toBe(201);

    await logOut(page);
    await page.goto("/");
    const curations = page.getByRole("region", { name: "운영자 추천" });
    const headings = await curations.getByRole("heading").allTextContents();
    const ours = headings.filter((text) => titles.includes(text));
    expect(ours).toEqual([titles[1], titles[0], titles[2]]);

    // 콘솔에서 첫 추천의 기간을 과거로 고친다.
    await asAdmin(page);
    await page.goto("/admin/portal/curations");
    const row = page.getByRole("region", { name: titles[0] });
    await row.getByLabel("시작").fill("2020-01-01T00:00");
    await row.getByLabel("종료").fill("2020-01-02T00:00");
    await row.getByRole("button", { name: "기간·순서 저장" }).click();
    await expect(page.getByRole("status")).toHaveText("추천을 고쳤습니다.");
    await page.goto("/admin/portal/curations?status=ENDED");
    await expect(page.getByRole("region", { name: titles[0] })).toBeVisible();

    await logOut(page);
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "운영자 추천" }).getByRole("heading", { name: titles[0] }),
    ).toHaveCount(0);
  });

  test("기간이 겹치는 6번째 추천은 409, 노출 조건이 없는 글은 422(#24)", async ({ page }) => {
    await asAdmin(page);
    // 다른 시험과 겹치지 않는 먼 미래 한 시간
    const base =
      Date.parse("2090-01-01T00:00:00Z") + (Number.parseInt(run, 36) % 100_000) * 3_600_000;
    const starts = new Date(base).toISOString();
    const ends = new Date(base + 3_600_000).toISOString();
    for (let n = 0; n < 5; n += 1) {
      expect((await createCuration(page.request, ids[n % 3], starts, ends, n)).status).toBe(201);
    }
    const sixth = await createCuration(page.request, ids[0], starts, ends, 9);
    expect(sixth.status).toBe(409);
    expect(sixth.body.header.resultCode).toBe("CURATION_LIMIT_EXCEEDED");

    await logOut(page);
    await logIn(page, writer);
    const privateId = await publishPost(page.request, writer.handle, {
      title: `추천${run} 비공개`,
      contentMarkdown: portalText(4, "private"),
      visibility: "PRIVATE",
    });
    await asAdmin(page);
    const ineligible = await createCuration(
      page.request,
      privateId,
      new Date().toISOString(),
      new Date(Date.now() + 3_600_000).toISOString(),
      0,
    );
    expect(ineligible.status).toBe(422);
    expect(ineligible.body.header.resultCode).toBe("POST_NOT_PORTAL_ELIGIBLE");
  });

  test("포털 제외는 포털에서만 빠지고 블로그·RSS에는 남으며, 해제하면 돌아온다(#27)", async ({
    page,
  }) => {
    await asAdmin(page);
    await page.goto("/admin/portal/exclusions");
    const add = page.getByRole("group", { name: "글 제외" });
    await add.getByLabel("글 주소 또는 번호").fill(`http://localhost/${member.handle}/${ids[2]}`);
    await add.getByLabel("사유").fill("광고성");
    await add.getByRole("button", { name: "제외" }).click();
    await expect(page.getByRole("status")).toHaveText("포털에서 제외했습니다.");
    await expect(page.getByRole("region", { name: titles[2] })).toBeVisible();

    await logOut(page);
    await page.goto("/");
    await expect(page.getByRole("region", { name: "최신 글" })).toBeVisible();
    expect(await page.content()).not.toContain(titles[2]);
    await page.goto(`/${member.handle}`);
    await expect(page.getByRole("heading", { name: titles[2] })).toBeVisible();
    expect(await (await page.request.get(`/${member.handle}/rss`)).text()).toContain(titles[2]);

    await asAdmin(page);
    await page.goto("/admin/portal/exclusions");
    await page
      .getByRole("region", { name: titles[2] })
      .getByRole("button", { name: "제외 해제" })
      .click();
    await expect(page.getByRole("status")).toHaveText("제외를 해제했습니다.");
    await logOut(page);
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "최신 글" }).getByRole("heading", { name: titles[2] }),
    ).toBeVisible();
  });

  test("주제 이름 변경·숨김이 글쓰기 주제 목록과 주제 주소에 바로 반영, slug 중복 오류(#28, #29)", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await asAdmin(page);
    await page.goto("/admin/topics");
    const camping = page.getByRole("region", { name: "캠핑·등산" });
    await camping.getByLabel("이름(한국어)").fill(`캠핑${run}`);
    await camping.getByRole("button", { name: "이름·색 저장" }).click();
    await expect(page.getByRole("status")).toHaveText("이름과 색을 저장했습니다.");

    const golf = page.getByRole("region", { name: "골프" });
    await golf.getByRole("button", { name: "숨기기" }).click();
    await expect(page.getByRole("status")).toHaveText("주제를 숨겼습니다.");
    await expect(page.getByRole("region", { name: "골프" })).toContainText("숨김");

    const create = page.getByRole("group", { name: "주제 추가" });
    await create.getByLabel("주소(slug)").fill("golf");
    for (const label of ["이름(한국어)", "이름(English)", "이름(日本語)", "이름(简体中文)"]) {
      await create.getByLabel(label).fill(`중복${run}`);
    }
    await create.getByRole("button", { name: "추가" }).click();
    await expect(page.getByRole("alert")).toContainText("이미 쓰고 있는 주제 주소입니다.");

    const hidden = await page.request.get("/topics/sports/golf");
    expect(hidden.status()).toBe(404);

    await logOut(page);
    await logIn(page, writer);
    await page.goto(`/${writer.handle}/write`);
    await page.getByRole("button", { name: "완료" }).click();
    const topic = page.getByRole("dialog", { name: "발행 설정" }).getByRole("combobox", {
      name: "주제",
    });
    await expect(topic.locator("option", { hasText: `캠핑${run}` })).toHaveCount(1);
    await expect(topic.locator("option", { hasText: "골프" })).toHaveCount(0);

    await asAdmin(page);
    await page.goto("/admin/topics");
    await page
      .getByRole("region", { name: "골프" })
      .getByRole("button", { name: "숨김 해제" })
      .click();
    await expect(page.getByRole("status")).toHaveText("주제 숨김을 해제했습니다.");
    expect((await page.request.get("/topics/sports/golf")).status()).toBe(200);
  });

  test("포털 설정: 최소 본문 길이 저장 → 짧은 글이 빠짐 → 기본값으로(#30)", async ({ page }) => {
    await asAdmin(page);
    await page.goto("/admin/portal/settings");
    const length = page.getByRole("region", { name: "최소 본문 길이" });
    await length.getByLabel(/글자 수/).fill("5000");
    await length.getByRole("button", { name: "저장" }).click();
    await expect(length.getByRole("status")).toHaveText("설정을 저장했습니다.");

    await logOut(page);
    await page.goto("/");
    expect(await page.content()).not.toContain(titles[1]);

    await asAdmin(page);
    await page.goto("/admin/portal/settings");
    await page
      .getByRole("region", { name: "최소 본문 길이" })
      .getByRole("button", { name: "기본값으로" })
      .click();
    await expect(
      page.getByRole("region", { name: "최소 본문 길이" }).getByRole("status"),
    ).toHaveText("기본값으로 되돌렸습니다.");
    await logOut(page);
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "최신 글" }).getByRole("heading", { name: titles[1] }),
    ).toBeVisible();
  });
});
