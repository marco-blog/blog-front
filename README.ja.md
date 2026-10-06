# blog-front

[한국어](README.md) | [English](README.en.md) | **日本語** | [简体中文](README.zh-CN.md)

Blog Platform（`blog.java21.net`）の React SSR フロントエンドです。React + Vite + TypeScript、React Router の framework モード（SSR）とカスタム Express サーバーで動作します。
仕様と原則は兄弟リポジトリ `blog-docs` にあります。韓国語の README が基準版です。

## 必要なもの

- Node.js 22.18 以上（22 LTS）。`server.ts` は Node の TypeScript 実行機能でそのまま起動します。
- API と画像のリクエストには `http://localhost:8080` で動く backend（`blog-backend`）が必要です。トップページと 404 ページは backend なしでも表示されます。

## 実行

```bash
npm install
cp .env.example .env      # 必要に応じて編集
npm run dev               # 開発サーバー http://localhost:5173（Vite HMR）
npm run build             # 本番ビルド（build/client, build/server）
npm start                 # NODE_ENV=production でビルドを実行
```

## 環境変数

`.env` があれば `npm run dev`・`npm start` が読み込みます。`.env` はコミットせず、`.env.example` だけを置きます。

| 名前               | 既定値                                                      | 説明                                                                                                                       |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `BLOG_BACKEND_URL` | `http://localhost:8080`                                     | backend のアドレス。プロキシ（`/api/**`、`/media/**` など）と SSR の loader・action が使います                             |
| `PORT`             | `5173`                                                      | front サーバーのポート。ローカルでは backend の許可 Origin（`http://localhost:5173`、`http://localhost:3000`）に合わせます |
| `NODE_ENV`         | `npm run dev` は `development`、`npm start` は `production` | 開発モードでは Vite ミドルウェアで描画します                                                                               |

## チェック

```bash
npm run typecheck
npm run lint
npm run format:check
npm test                  # Vitest + カバレッジ。行カバレッジ 80% 未満で失敗
npm run e2e               # ビルドしたサーバーに対する Playwright
```

`npm test` には翻訳漏れチェックが含まれ、4 言語のどれかでキーが欠けているか空の場合に失敗します。
