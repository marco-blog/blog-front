import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5173);
const FEED_STUB_PORT = Number(process.env.E2E_FEED_STUB_PORT ?? 4610);

/**
 * E2E(헌법 원칙 III). 스토리별 Independent Test 시나리오는 각 기능과 함께 tests/e2e에 더한다.
 * 빌드한 front 서버를 띄워 검사한다. backend가 필요한 시나리오는 BLOG_BACKEND_URL로 연결한다.
 */
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // 시나리오는 한국어 화면 문구로 요소를 찾는다. 브라우저 언어(Accept-Language)를 한국어로 고정한다.
    locale: "ko-KR",
  },
  // 포털 시나리오(portal-*)는 메인 "최신 글"·추천·포털 설정처럼 사이트 전체에 하나뿐인 화면을 본다. 다른 시나리오가 같은 DB에
  // 글을 동시에 발행하면 목록이 밀리므로, 나머지를 모두 돌린 뒤 한 번에 한 파일씩(workers 1) 돈다.
  // 005 신고·스팸 방어·트랙백 시나리오(moderation-*)는 금칙어·운영 설정처럼 사이트 전체에 걸리는 값을 바꾸므로 역시 나머지 뒤에
  // 한 번에 한 파일씩 돈다. 포털 시나리오가 보는 "최신 글"을 흔들지 않도록 portal 다음에 돈다.
  projects: [
    {
      name: "e2e",
      testIgnore: [
        /portal-.*\.spec\.ts$/,
        /moderation-.*\.spec\.ts$/,
        /admin-.*\.spec\.ts$/,
        /external-.*\.spec\.ts$/,
      ],
    },
    { name: "portal", testMatch: /portal-.*\.spec\.ts$/, dependencies: ["e2e"], workers: 1 },
    {
      name: "moderation",
      testMatch: /moderation-.*\.spec\.ts$/,
      dependencies: ["e2e", "portal"],
      workers: 1,
    },
    // 006 관리 콘솔 시나리오(admin-*)는 권한 부여·회수, 릴리스 노트 게시처럼 사이트 전체에 걸리는 상태를 바꾸므로 맨 마지막에
    // 한 번에 한 파일씩 돈다.
    {
      name: "admin",
      testMatch: /admin-.*\.spec\.ts$/,
      dependencies: ["portal", "moderation"],
      workers: 1,
    },
    // 007 외부 블로그 시나리오(external-*)는 포털 "최신 글"에 외부 글을 섞고 운영 설정(외부 글 가중치 등)을 바꾸므로 맨 마지막에
    // 한 번에 한 파일씩 돈다. 피드는 아래 webServer의 스텁 서버가 준다(인터넷에 나가지 않음).
    {
      name: "external",
      testMatch: /external-.*\.spec\.ts$/,
      dependencies: ["portal", "moderation", "admin"],
      workers: 1,
    },
  ],
  webServer: [
    {
      command: "npm run build && npm start",
      // 첫 화면(/)은 포털(003)이라 backend가 있어야 200이다. 준비 확인은 backend 없이 뜨는 /login으로 한다.
      url: `http://localhost:${PORT}/login`,
      // backend가 필요한 시나리오(tests/e2e/us1-*)는 E2E_BACKEND_URL이 있을 때만 돈다. 그때 front도 같은 backend를 본다.
      env: {
        PORT: String(PORT),
        ...(process.env.E2E_BACKEND_URL ? { BLOG_BACKEND_URL: process.env.E2E_BACKEND_URL } : {}),
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // 007 피드 스텁 서버(127.0.0.1:E2E_FEED_STUB_PORT, 기본 4610).
      command: "node tests/e2e/support/feed-stub-server.mjs",
      url: `http://127.0.0.1:${FEED_STUB_PORT}/__stub/health`,
      env: { E2E_FEED_STUB_PORT: String(FEED_STUB_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
