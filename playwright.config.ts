import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5173);

/**
 * E2E(헌법 원칙 III). 스토리별 Independent Test 시나리오는 각 기능과 함께 tests/e2e에 더한다.
 * 빌드한 front 서버를 띄워 검사한다. backend가 필요한 시나리오는 BLOG_BACKEND_URL로 연결한다.
 */
export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: "npm run build && npm start",
    url: `http://localhost:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
