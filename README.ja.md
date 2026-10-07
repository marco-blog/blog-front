# blog-front

[한국어](README.md) | [English](README.en.md) | **日本語** | [简体中文](README.zh-CN.md)

[blog.java21.net](https://blog.java21.net) で運用するマルチユーザーブログプラットフォーム（Tistory のようなサービス）の React SSR フロントエンドです。
ブログホーム・記事詳細・一覧などの公開画面をサーバーでレンダリングし（JS なしでも本文とメタタグが HTML に含まれます）、記事作成・ブログ管理・アカウント設定の画面を提供します。
API は兄弟リポジトリ [blog-backend](https://github.com/marco-blog/blog-backend)（Spring Boot）が担当し、仕様は [blog-docs](https://github.com/marco-blog/blog-docs) にあります。

## 技術スタック

- React 19 + TypeScript、Vite、React Router 8 フレームワークモード（SSR）、カスタム Express 5 サーバー（`server.ts`）
- 記事エディター: Milkdown Crepe（作成画面でのみブラウザに読み込む）、コードハイライト: highlight.js（SSR）
- 多言語: i18next + react-i18next、4 言語（ko・en・ja・zh-CN）
- テスト: Vitest + Testing Library（ライン 80% 以上）、Playwright（E2E）、ESLint、Prettier

## 必要なもの

- Node.js 22.18 以上（22 LTS）。サーバーのエントリポイント `server.ts` を Node の TypeScript 実行機能でそのまま起動します。
- API・画像のリクエストには backend（`blog-backend`）が `http://localhost:8080` で動いている必要があります。トップ画面と 404 画面は backend なしでも表示されます。backend の起動方法は [blog-backend の README](https://github.com/marco-blog/blog-backend#readme) を参照してください。
- 3 つのリポジトリを兄弟ディレクトリに置くと、ドキュメントの相対パスが合います: `blog/blog-docs`、`blog/blog-backend`、`blog/blog-front`

## 実行

```bash
npm install
cp .env.example .env      # 必要なら値を変更
npm run dev               # 開発サーバー http://localhost:5173（Vite HMR）
```

本番ビルドと実行:

```bash
npm run build             # build/client、build/server を生成
npm start                 # NODE_ENV=production でビルド成果物を実行
```

## 環境変数

`.env` があれば `npm run dev`・`npm start` が読み込みます（`node --env-file-if-exists`）。`.env` はコミットせず、`.env.example` だけを置きます。秘密値はありません。

| 名前                | 既定値                                                      | 説明                                                                                                                                                                                                                                                                                                                         |
| ------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOG_BACKEND_URL`  | `http://localhost:8080`                                     | backend のアドレス。`/api/**`・`/media/**` などのプロキシ先であり、SSR の loader・action が直接呼び出すアドレス                                                                                                                                                                                                              |
| `PORT`              | `5173`                                                      | front サーバーのポート。backend の許可 Origin（ローカルでは `http://localhost:5173`、`http://localhost:3000`）に合わせます                                                                                                                                                                                                   |
| `BLOG_PUBLIC_URL`   | 受け取ったリクエストのアドレス                              | サイトの公開アドレス（scheme+host）。SSR が backend に送る POST（トークン更新・閲覧数）の `Origin` に使います。backend の `blog.base-url` と同じにします                                                                                                                                                                     |
| `BLOG_KAKAO_JS_KEY` | なし（カカオトークボタンを隠す）                            | Kakao JavaScript キー（カカオトーク共有）。公開値ですが、Kakao Developers のアプリの Web プラットフォームのサイトドメインにサービスのアドレス（本番 `https://blog.java21.net`）を登録する必要があります。値があるときだけ CSP に `https://t1.kakaocdn.net`（script-src）と `https://kapi.kakao.com`（connect-src）を加えます |
| `NODE_ENV`          | `npm run dev` は `development`、`npm start` は `production` | 開発モードでは Vite ミドルウェアでレンダリングします                                                                                                                                                                                                                                                                         |

カカオトーク共有は、`app/share/kakao.client.ts` に固定したバージョン・SRI ハッシュで、最初に押したときだけ SDK を読み込みます。SDK のバージョンを上げるときは Kakao Developers のドキュメントの integrity 値も一緒に変えます。

## チェック・テスト

```bash
npm run lint              # ESLint
npm run format:check      # Prettier（修正は npm run format）
npm run typecheck         # ルート型の生成 + tsc
npm test -- --coverage    # Vitest + カバレッジ。ライン 80% 未満で失敗（vitest.config.ts で常に有効なので npm test でも同じ）
npm run build
```

- カバレッジレポート: `coverage/index.html`
- 翻訳漏れチェック（`tests/unit/i18n/translations.test.ts`）は `npm test` に含まれ、4 言語のいずれかでキーが欠けたり値が空だったりすると失敗します。
- CI（`.github/workflows/ci.yml`）は PR と `main` への push ごとに上記のチェック、ビルド、backend なしで動く E2E（smoke）を実行し、`e2e-backend` ジョブで backend の `main` と使い捨ての MySQL を起動して backend が必要な E2E を実行します。

## E2E（Playwright）

```bash
npx playwright install chromium      # 初回のみ
npm run e2e                          # = npx playwright test
```

`playwright.config.ts` が `npm run build && npm start` で front サーバーを起動して（`E2E_PORT`、既定 5173）テストします。環境変数によって実行されるシナリオが変わります。

| 環境変数                                | 例                      | ない場合                                                                                                                                                    |
| --------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| （なし）                                |                         | トップ画面・404・セキュリティヘッダーなどの smoke シナリオのみ実行                                                                                          |
| `E2E_BACKEND_URL`                       | `http://localhost:8080` | 登録・記事・カテゴリ・コメント・画像・言語のシナリオ（`tests/e2e/us*`）をスキップ。設定すると front サーバーもこの backend を使います（`BLOG_BACKEND_URL`） |
| `MAILPIT_URL`                           | `http://localhost:8025` | パスワード再設定メールを読むシナリオをスキップ（backend が同じ Mailpit へメールを送る必要があります）                                                       |
| `E2E_PORTAL_TEST_SETTINGS`              | `1`                     | ポータル（003）のシナリオ（`tests/e2e/portal-*`）をスキップ。backend を下記のポータル試験用設定で起動したという印です                                       |
| `E2E_GUEST_TEST_SETTINGS`               | `1`                     | 非会員のコメント・ゲストブック（004）のシナリオをスキップ。backend を下記の非会員試験用設定で起動したという印です                                           |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | 管理者アカウント        | 管理コンソールとリリースノートのシナリオをスキップ。backend の `BLOG_ADMIN_BOOTSTRAP_SUPER_ADMIN_EMAIL` と同じメールアドレスで登録したアカウントです        |

backend を含めてすべて実行するには、backend の README のとおりに MySQL（スキーマ適用）・Mailpit・backend（local プロファイル）を起動してから:

```bash
E2E_BACKEND_URL=http://localhost:8080 MAILPIT_URL=http://localhost:8025 npm run e2e
```

ポータル（003）のシナリオは backend を試験用の運用設定で起動する必要があります: `BLOG_PORTAL_CACHE_TTL=0s`（キャッシュなし）、`BLOG_PORTAL_NEW_MEMBER_DELAY=PT0S`（登録直後から表示）、`BLOG_PORTAL_TOPIC_AUTO_HIDE_THRESHOLD=1`、最初の管理者 `BLOG_ADMIN_BOOTSTRAP_SUPER_ADMIN_EMAIL=<管理者メールアドレス>`（値は `.env` にだけ置き、コミットしません）。front の試験アドレス（既定 `http://localhost:5173`）は backend の `blog.security.allowed-origins` に含める必要があります。そのうえで:

```bash
E2E_BACKEND_URL=http://localhost:8080 E2E_PORTAL_TEST_SETTINGS=1 \
  E2E_ADMIN_EMAIL=<管理者メールアドレス> E2E_ADMIN_PASSWORD=<パスワード> npm run e2e
```

004 のブログ機能シナリオ（`tests/e2e/blog-*`）は backend の local プロファイルの既定値で動きます。非会員の書き込みシナリオは同じ IP（localhost）から何度も書くため、非会員の書き込み制限を緩めて起動し `E2E_GUEST_TEST_SETTINGS=1` を指定します: `BLOG_GUEST_COMMENT_PER_MINUTE=1000`、`BLOG_GUEST_GUESTBOOK_PER_MINUTE=1000`。バックアップのシナリオでは backend が `BLOG_EXPORT_DIR`（local の既定は `./data/exports`）に zip を書きます。予約公開とバックアップのシナリオはバッチ処理の周期（30 秒）を待つため 1〜2 分かかります。

ポータルのシナリオはメインの「最新記事」・おすすめ・ポータル設定のようなサイトに一つしかない画面を見るため、Playwright プロジェクト `portal` として残り（`e2e`）が終わった後に一度に1ファイルずつ実行します。CI（`ci.yml` の e2e-backend、`e2e.yml`）は上記の試験用設定で backend を起動し、`scripts/e2e-provision-admin.sh` で使い捨て DB に管理者アカウントを作ります（登録 API → `role` を SUPER_ADMIN に）。

`CI` がなければ、同じポートで起動済みの front サーバーを再利用します。シナリオは実行ごとに新しいアカウントを作るので、同じ DB で何度実行しても構いません。

## 構成

```text
server.ts                 # Express のエントリ: X-Request-Id、backend プロキシ、セキュリティヘッダー、静的ファイル、React Router
server/app.ts             # React Router のリクエストハンドラー（ビルド時に build/server へ同梱）、CSP nonce を load context で渡す
server/middleware/        # request-id、backend-proxy
app/entry.server.tsx      # SSR のエントリ（React Router 既定 + CSP nonce）
app/root.tsx              # 共通レイアウト（ヘッダー・フッター）、ログイン会員・言語の決定（root loader）、エラーバウンダリー
app/server/               # セキュリティヘッダー（CSP・HSTS など）、load context
app/auth/                 # セッションヘルパー（getSessionUser、requireUser、next の検証）
app/components/layout/    # Header、Footer
app/routes.ts             # ルート定義（blog-docs contracts/routes.md 準拠）
app/routes/               # ルートモジュール
app/api/                  # backend クライアント（client.server.ts）、共通レスポンス型、ApiError、エラーコード → 文言（errorMessage.ts）
app/i18n/                 # i18next の設定、言語の決定
app/locales/{ko,en,ja,zh-CN}/*.json   # 翻訳ファイル（基準言語 ko）
tests/unit/               # Vitest
tests/e2e/                # Playwright
```

## ルールの要約

- ブラウザは front サーバーだけを呼び出します。`/api/**`、`/media/**`、フィード（`/:handle/rss` など）、トラックバック、サイトマップ・robots は front サーバーが backend へ転送し、ブラウザの `Origin`・Cookie は変えずに渡します。
- SSR の loader・action は `createApiClient(request)` で backend を直接呼び出します。Cookie・`Accept-Language`・`Origin`・`X-Request-Id` を転送し、レスポンスの `result` を返し、失敗時は `ApiError`（status、resultCode、fieldErrors、traceId）を投げます。
- 画面の文言はコードに書かず `app/locales` のキーを使います。新しい文言は 4 言語を同じ PR に入れます。API エラーは `errors:{code}`、入力エラーは `errors:fieldErrors.{code}` で表示し、未知のコードは汎用の文言にフォールバックします。
- front サーバーは HTML レスポンスにセキュリティヘッダーを付けます（blog-docs research.md R27）: リクエストごとの nonce を使う CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy`、本番のみ HSTS。サーバーでレンダリングした `<script>` には同じ nonce が付くので、インラインスクリプトを直接書かないでください。
- `dangerouslySetInnerHTML` は無害化済みの記事本文の表示（`app/components/post/PostContent.tsx`）でのみ使います。ほかのファイルでは ESLint が禁止します。
- ログインが必要な画面の loader は `requireUser(request)` を呼びます。未ログインなら `/login?next={現在のパス}` へ送り、`next` は同一サイトの相対パスのみ受け付けます（`safeNextPath`）。
- 画面の言語は 会員設定 → Cookie `lang` → `Accept-Language` → 英語 の順で決めます。URL に言語プレフィックスは付けません。

## ドキュメント

- 仕様: [blog-docs/specs](https://github.com/marco-blog/blog-docs/tree/main/specs) — コア機能は [specs/001-blog-core](https://github.com/marco-blog/blog-docs/tree/main/specs/001-blog-core)（spec、contracts/routes.md、contracts/api.md、quickstart.md）
- backend の運用ドキュメント（環境変数、バックアップ、定期ジョブ）: [blog-backend docs/operations.md](https://github.com/marco-blog/blog-backend/blob/main/docs/operations.md)
- API 規約: [blog-docs/api-guidelines.md](https://github.com/marco-blog/blog-docs/blob/main/api-guidelines.md)
- 開発ルール: [CLAUDE.md](CLAUDE.md)、原則は blog-docs `.specify/memory/constitution.md`
