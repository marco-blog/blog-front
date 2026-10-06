import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { callApi, logIn, newAccount, requireBackend, signUp } from "./support/backend.js";

interface CategoryNode {
  id: number;
  name: string;
  postCount: number;
  children: CategoryNode[];
}

/** 카테고리 관리 화면에서 카테고리를 만든다. */
async function createCategory(page: Page, name: string, parent?: string) {
  const form = page.getByRole("group", { name: "새 카테고리" });
  await form.getByLabel("이름").fill(name);
  await form.getByLabel("상위 카테고리").selectOption(parent ? { label: parent } : { value: "" });
  await form.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByRole("status")).toHaveText("카테고리를 만들었습니다.");
  await expect(page.getByLabel(`${name} 이름`)).toBeVisible();
}

/** 카테고리·태그를 담아 임시저장 후 발행한다(API). */
async function publishClassified(
  request: APIRequestContext,
  handle: string,
  post: { title: string; categoryId: number | null; tags: string[] },
) {
  const draft = await callApi<{ id: number }>(request, "POST", `/blogs/${handle}/posts/drafts`, {
    title: post.title,
    contentMarkdown: `${post.title} 본문`,
    categoryId: post.categoryId,
    tags: post.tags,
  });
  expect(draft.status).toBe(201);
  const published = await callApi(request, "POST", `/posts/${draft.body.result.id}/publish`, {
    visibility: "PUBLIC",
    commentEnabled: true,
  });
  expect(published.status).toBe(200);
  return draft.body.result.id;
}

const postTitles = (page: Page) =>
  page.getByRole("list", { name: "글 목록" }).getByRole("heading", { level: 2 });

// US2 Independent Test(spec.md): 카테고리 2개(상위·하위) 생성 → 글 3편을 서로 다른 카테고리·태그로 발행
// → 카테고리/태그별 목록에 해당 글만 나오는지 확인. backend가 있어야 돈다(E2E_BACKEND_URL).
test.describe("US2 카테고리와 태그", () => {
  requireBackend();
  test.describe.configure({ mode: "serial" });

  const owner = newAccount("c");
  const tag = `t${owner.handle.slice(-8)}`;
  let tree: CategoryNode[] = [];

  test("상위·하위 카테고리를 만들면 블로그 옆에 계층으로 보인다 (AS1)", async ({ page }) => {
    await signUp(page, owner);
    await page.goto(`/${owner.handle}/manage`);
    await page
      .getByRole("navigation", { name: "블로그 관리 메뉴" })
      .getByRole("link", { name: "카테고리" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/manage/categories$`));
    await expect(page.getByText("아직 카테고리가 없습니다.")).toBeVisible();

    await createCategory(page, "개발");
    await createCategory(page, "Spring", "개발");
    await createCategory(page, "일상");

    // 같은 위치의 같은 이름은 막힌다.
    await createCategoryExpectingError(page, "개발");

    const categories = await callApi<CategoryNode[]>(
      page.request,
      "GET",
      `/blogs/${owner.handle}/categories`,
    );
    tree = categories.body.result;
    expect(tree.map((node) => [node.name, node.children.map((child) => child.name)])).toEqual([
      ["개발", ["Spring"]],
      ["일상", []],
    ]);

    await page.goto(`/${owner.handle}`);
    const side = page.getByRole("navigation", { name: "카테고리" });
    await expect(side.getByRole("link", { name: "개발 (0)" })).toBeVisible();
    await expect(
      side
        .getByRole("listitem")
        .filter({ hasText: "개발" })
        .getByRole("link", { name: "Spring (0)" }),
    ).toBeVisible();
  });

  test("작성 화면에서 카테고리·태그를 고르고, 11번째 태그는 들어가지 않는다 (AS3)", async ({
    page,
  }) => {
    await logIn(page, owner);

    await page.goto(`/${owner.handle}/write`);
    await page.getByLabel("제목").fill("스프링 글");
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("스프링 이야기");
    await page.getByRole("button", { name: "완료" }).click();
    const dialog = page.getByRole("dialog", { name: "발행 설정" });
    await dialog.getByLabel("카테고리").selectOption({ label: "— Spring" });
    const input = dialog.getByRole("textbox", { name: "태그" });
    const tags = [` ${tag.toUpperCase()} `, ...Array.from({ length: 9 }, (_, i) => `tag ${i}`)];
    for (const value of tags) {
      await input.fill(value);
      await input.press("Enter");
    }
    await input.fill("eleventh");
    await input.press("Enter");
    await expect(dialog.getByRole("alert")).toHaveText("태그는 10개까지 넣을 수 있습니다.");
    await expect(dialog.getByRole("list", { name: "태그" }).getByRole("listitem")).toHaveCount(10);
    await expect(dialog.getByText(`#${tag}`, { exact: true })).toBeVisible();

    await dialog.getByRole("button", { name: "공개 발행" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/\\d+$`));
    const article = page.getByRole("article");
    await expect(article.getByRole("link", { name: "Spring" })).toBeVisible();
    await expect(article.getByRole("link", { name: `#${tag}` })).toBeVisible();
    await expect(article.getByRole("link", { name: "#eleventh" })).toHaveCount(0);
  });

  test("카테고리·태그를 누르면 해당 공개 글만 최신순으로 (AS4)", async ({ page }) => {
    await logIn(page, owner);

    const [dev, daily] = tree;
    await publishClassified(page.request, owner.handle, {
      title: "개발 일반 글",
      categoryId: dev.id,
      tags: [tag],
    });
    await publishClassified(page.request, owner.handle, {
      title: "일상 글",
      categoryId: daily.id,
      tags: ["daily"],
    });

    // 방문자로 본다.
    await page.context().clearCookies();
    await page.goto(`/${owner.handle}`);
    await page
      .getByRole("navigation", { name: "카테고리" })
      .getByRole("link", { name: "개발 (2)" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/category/${dev.id}$`));
    await expect(page).toHaveTitle(/^개발 - /);
    await expect(postTitles(page)).toHaveText(["개발 일반 글", "스프링 글"]);

    await page.getByRole("navigation", { name: "하위 카테고리" }).getByRole("link").click();
    await expect(postTitles(page)).toHaveText(["스프링 글"]);

    await page.goto(`/${owner.handle}/tags/${tag}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`#${tag}`);
    await expect(postTitles(page)).toHaveText(["개발 일반 글", "스프링 글"]);

    await page.goto(`/tags/${tag}`);
    await expect(page).toHaveTitle(`#${tag} - 블로그`);
    await expect(postTitles(page)).toHaveText(["개발 일반 글", "스프링 글"]);
    await page.getByRole("link", { name: "스프링 글" }).click();
    await expect(page).toHaveURL(new RegExp(`/${owner.handle}/\\d+$`));

    const missing = await page.goto(`/${owner.handle}/category/999999999`);
    expect(missing?.status()).toBe(404);
  });

  test("카테고리를 지우면 글은 남고 미분류가 된다 (AS2)", async ({ page }) => {
    await logIn(page, owner);

    await page.goto(`/${owner.handle}/manage/categories`);
    await page.getByRole("button", { name: "일상 삭제" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("공개 글 1편");
    await confirm.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByRole("status")).toHaveText("카테고리를 삭제했습니다.");
    await expect(page.getByLabel("일상 이름")).toHaveCount(0);

    await page.goto(`/${owner.handle}/manage/posts`);
    const item = page.getByRole("list", { name: "글 목록" }).getByRole("listitem").filter({
      hasText: "일상 글",
    });
    await expect(item).toContainText("카테고리: 미분류");

    // 일괄 작업으로 미분류 글을 다시 카테고리에 넣는다.
    await page.getByLabel("일상 글 선택").check();
    await page.getByLabel("옮길 카테고리").selectOption({ label: "개발" });
    await page.getByRole("button", { name: "옮기기", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("글 1편을 바꿨습니다.");
    await expect(item).toContainText("카테고리: 개발");
  });
});

async function createCategoryExpectingError(page: Page, name: string) {
  const form = page.getByRole("group", { name: "새 카테고리" });
  await form.getByLabel("이름").fill(name);
  await form.getByLabel("상위 카테고리").selectOption({ value: "" });
  await form.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "같은 위치에 이미 같은 이름의 카테고리가 있습니다.",
  );
}
