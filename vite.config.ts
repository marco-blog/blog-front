import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          // 서버 빌드의 진입점: React Router 요청 처리기를 감싼 Express 앱
          input: "./server/app.ts",
        },
      },
    },
  },
  plugins: [reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
});
