import { expect, test } from "@playwright/test";

// JS 없이도 서버 렌더링된 HTML에 본문이 있어야 한다(헌법 원칙 V).
test("첫 화면은 서버에서 화면 언어로 렌더링된다", async ({ request }) => {
  const response = await request.get("/", { headers: { "Accept-Language": "ko-KR,ko;q=0.9" } });

  expect(response.status()).toBe(200);
  expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f]{16}$/);
  const html = await response.text();
  expect(html).toContain('<html lang="ko">');
  expect(html).toContain("블로그 서비스를 준비하고 있습니다.");
});

test("쿠키 lang이 Accept-Language보다 먼저다", async ({ request }) => {
  const response = await request.get("/", {
    headers: { "Accept-Language": "ko", Cookie: "lang=en" },
  });

  expect(await response.text()).toContain("Our blog service is coming soon.");
});

test("없는 주소는 404 상태 코드와 404 화면", async ({ request }) => {
  const response = await request.get("/no/such/page", { headers: { "Accept-Language": "ja" } });

  expect(response.status()).toBe(404);
  expect(await response.text()).toContain("ページが見つかりません");
});
