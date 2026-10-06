import { expect, test } from "@playwright/test";

// JS 없이도 서버 렌더링된 HTML에 본문이 있어야 한다(헌법 원칙 V).
// 003부터 첫 화면(/)은 포털이라 backend가 필요하다. backend 없이 도는 이 검사는 /login으로 본다.
test("로그인 화면은 서버에서 화면 언어로 렌더링된다", async ({ request }) => {
  const response = await request.get("/login", {
    headers: { "Accept-Language": "ko-KR,ko;q=0.9" },
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["x-request-id"]).toMatch(/^[0-9a-f]{16}$/);
  const html = await response.text();
  expect(html).toContain('<html lang="ko">');
  expect(html).toContain("아직 계정이 없나요?");
});

test("쿠키 lang이 Accept-Language보다 먼저다", async ({ request }) => {
  const response = await request.get("/login", {
    headers: { "Accept-Language": "ko", Cookie: "lang=en" },
  });

  expect(await response.text()).toContain("Forgot your password?");
});

test("없는 주소는 404 상태 코드와 404 화면", async ({ request }) => {
  const response = await request.get("/no/such/page", { headers: { "Accept-Language": "ja" } });

  expect(response.status()).toBe(404);
  expect(await response.text()).toContain("ページが見つかりません");
});

// 보안 헤더(research.md R27): 요청별 nonce가 CSP와 서버 렌더링된 모든 script에 같게 실린다.
test("HTML 응답에 CSP nonce·보안 헤더가 있고, script마다 같은 nonce", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();

  const nonce = /'nonce-([^']+)'/.exec(headers["content-security-policy"] ?? "")?.[1];
  expect(nonce).toBeTruthy();
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toBe("max-age=31536000");

  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    expect(script).toContain(`nonce="${nonce}"`);
  }

  const next = await request.get("/login");
  expect(next.headers()["content-security-policy"]).not.toBe(headers["content-security-policy"]);
});

test("공통 틀: 비로그인 상단 메뉴와 하단 약관 링크", async ({ request }) => {
  const html = await (await request.get("/terms", { headers: { "Accept-Language": "ko" } })).text();

  expect(html).toContain('href="/login"');
  expect(html).toContain('href="/signup"');
  expect(html).toContain('href="/terms"');
  expect(html).toContain('href="/privacy"');
});
