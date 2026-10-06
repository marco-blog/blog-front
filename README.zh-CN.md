# blog-front

[한국어](README.md) | [English](README.en.md) | [日本語](README.ja.md) | **简体中文**

Blog Platform（`blog.java21.net`）的 React SSR 前端。基于 React + Vite + TypeScript、React Router framework 模式（SSR）和自定义 Express 服务器。
规范与原则位于同级仓库 `blog-docs`。以韩语 README 为准。

## 环境要求

- Node.js 22.18 及以上（22 LTS）。`server.ts` 直接通过 Node 内置的 TypeScript 支持运行。
- API 和图片请求需要在 `http://localhost:8080` 运行的 backend（`blog-backend`）。首页和 404 页面无需 backend 也能显示。

## 运行

```bash
npm install
cp .env.example .env      # 按需修改
npm run dev               # 开发服务器 http://localhost:5173（Vite HMR）
npm run build             # 生产构建（build/client, build/server）
npm start                 # 以 NODE_ENV=production 运行构建产物
```

## 环境变量

如果存在 `.env`，`npm run dev` 和 `npm start` 会读取它。不要提交 `.env`，只保留 `.env.example`。

| 名称               | 默认值                                                      | 说明                                                                                                     |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `BLOG_BACKEND_URL` | `http://localhost:8080`                                     | backend 地址，供代理（`/api/**`、`/media/**` 等）和 SSR 的 loader、action 使用                           |
| `PORT`             | `5173`                                                      | front 服务器端口。本地需与 backend 允许的 Origin（`http://localhost:5173`、`http://localhost:3000`）一致 |
| `NODE_ENV`         | `npm run dev` 为 `development`，`npm start` 为 `production` | 开发模式通过 Vite 中间件渲染                                                                             |

## 检查

```bash
npm run typecheck
npm run lint
npm run format:check
npm test                  # Vitest + 覆盖率，行覆盖率低于 80% 时失败
npm run e2e               # 针对构建后服务器的 Playwright
```

`npm test` 包含翻译缺失检查，四种语言中任何一种缺少键或值为空都会失败。
