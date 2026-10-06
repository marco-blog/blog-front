import { defineConfig } from "vitest/config";

// React Router Vite 플러그인은 테스트에서 쓰지 않는다(라우트 모듈을 직접 불러와 검사).
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    coverage: {
      // npm test만으로 커버리지를 재고, 기준 미달이면 실패한다(헌법 원칙 III).
      enabled: true,
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "server/**/*.ts"],
      // entry.server.tsx(React Router 기본 진입점 + nonce)와 server/app.ts는 E2E(tests/e2e)에서 확인한다.
      exclude: [
        "app/routes.ts",
        "app/**/*.d.ts",
        "app/api/types.ts",
        "app/entry.server.tsx",
        "server/app.ts",
      ],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 80,
      },
    },
  },
});
