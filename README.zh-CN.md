# blog-front

[한국어](README.md) | [English](README.en.md) | [日本語](README.ja.md) | **简体中文**

运行在 [blog.java21.net](https://blog.java21.net) 的多用户博客平台（类似 Tistory 的服务）的 React SSR 前端。
博客首页、文章详情、列表等公开页面在服务器端渲染（即使没有 JS，正文和 meta 标签也在 HTML 中），并提供写文章、博客管理和账号设置界面。
API 由同级仓库 [blog-backend](https://github.com/marco-blog/blog-backend)（Spring Boot）提供，规格文档位于 [blog-docs](https://github.com/marco-blog/blog-docs)。

## 技术栈

- React 19 + TypeScript、Vite、React Router 8 框架模式（SSR）、自定义 Express 5 服务器（`server.ts`）
- 文章编辑器：Milkdown Crepe（仅在写作界面于浏览器中加载）；代码高亮：highlight.js（SSR）
- 多语言：i18next + react-i18next，四种语言（ko、en、ja、zh-CN）
- 测试：Vitest + Testing Library（行覆盖率 ≥ 80%）、Playwright（E2E）、ESLint、Prettier

## 环境要求

- Node.js 22.18 及以上（22 LTS）。服务器入口 `server.ts` 直接用 Node 内置的 TypeScript 运行能力启动。
- API 和图片请求需要 backend（`blog-backend`）运行在 `http://localhost:8080`。首页和 404 页面没有 backend 也能显示。backend 的运行方法见 [blog-backend README](https://github.com/marco-blog/blog-backend#readme)。
- 将三个仓库放在同级目录下，文档中的相对路径才能对应：`blog/blog-docs`、`blog/blog-backend`、`blog/blog-front`

## 运行

```bash
npm install
cp .env.example .env      # 按需修改
npm run dev               # 开发服务器 http://localhost:5173（Vite HMR）
```

生产构建与运行：

```bash
npm run build             # 生成 build/client、build/server
npm start                 # 以 NODE_ENV=production 运行构建产物
```

## 环境变量

如果存在 `.env`，`npm run dev` 和 `npm start` 会读取它（`node --env-file-if-exists`）。不要提交 `.env`，只保留 `.env.example`。这里没有密钥。

| 名称                | 默认值                                                      | 说明                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOG_BACKEND_URL`  | `http://localhost:8080`                                     | backend 地址。是 `/api/**`、`/media/**` 等的代理目标，也是 SSR loader、action 直接调用的地址                                                                                                                                                                                     |
| `PORT`              | `5173`                                                      | front 服务器端口。需与 backend 允许的 Origin 一致（本地为 `http://localhost:5173`、`http://localhost:3000`）                                                                                                                                                                     |
| `BLOG_PUBLIC_URL`   | 收到的请求的地址                                            | 站点公开地址（scheme+host）。用作 SSR 发给 backend 的 POST（令牌刷新、浏览数）的 `Origin`。应与 backend 的 `blog.base-url` 相同                                                                                                                                                  |
| `BLOG_KAKAO_JS_KEY` | 无（隐藏 KakaoTalk 按钮）                                   | Kakao JavaScript 密钥（KakaoTalk 分享）。虽然是公开值，但必须在 Kakao Developers 应用的 Web 平台站点域名中登记服务地址（生产环境 `https://blog.java21.net`）才能使用。仅在设置时，CSP 才会加入 `https://t1.kakaocdn.net`（script-src）和 `https://kapi.kakao.com`（connect-src） |
| `NODE_ENV`          | `npm run dev` 为 `development`，`npm start` 为 `production` | 开发模式下通过 Vite 中间件渲染                                                                                                                                                                                                                                                   |

KakaoTalk 分享仅在首次点击时，以 `app/share/kakao.client.ts` 中固定的版本和 SRI 哈希加载 SDK。升级 SDK 版本时，请同时按 Kakao Developers 文档更新 integrity 值。

## 检查与测试

```bash
npm run lint              # ESLint
npm run format:check      # Prettier（修复用 npm run format）
npm run typecheck         # 生成路由类型 + tsc
npm test -- --coverage    # Vitest + 覆盖率。行覆盖率低于 80% 时失败（vitest.config.ts 中始终开启覆盖率，npm test 效果相同）
npm run build
```

- 覆盖率报告：`coverage/index.html`
- 翻译缺失检查（`tests/unit/i18n/translations.test.ts`）包含在 `npm test` 中，四种语言中任何一种缺少键或值为空都会失败。
- CI（`.github/workflows/ci.yml`）在每个 PR 和推送到 `main` 时运行上述检查、构建以及不需要 backend 的 E2E（smoke）；`e2e-backend` 作业会启动 backend 的 `main` 和一次性 MySQL，运行需要 backend 的 E2E。

## E2E（Playwright）

```bash
npx playwright install chromium      # 仅首次
npm run e2e                          # = npx playwright test
```

`playwright.config.ts` 通过 `npm run build && npm start` 启动 front 服务器（`E2E_PORT`，默认 5173）后进行测试。运行哪些场景取决于环境变量：

| 环境变量                                | 示例                    | 未设置时                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| （无）                                  |                         | 只运行首页、404、安全响应头等 smoke 场景                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `E2E_BACKEND_URL`                       | `http://localhost:8080` | 跳过注册、文章、分类、评论、图片、语言场景（`tests/e2e/us*`）。设置后 front 服务器也使用该 backend（`BLOG_BACKEND_URL`）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `MAILPIT_URL`                           | `http://localhost:8025` | 跳过读取密码重置邮件的场景（backend 必须把邮件发送到同一个 Mailpit）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `E2E_PORTAL_TEST_SETTINGS`              | `1`                     | 跳过门户（003）场景（`tests/e2e/portal-*`）。表示 backend 已使用下面的门户测试设置启动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `E2E_GUEST_TEST_SETTINGS`               | `1`                     | 跳过非会员评论和留言板（004）场景。表示 backend 已使用下面的非会员测试设置启动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `E2E_MODERATION_TEST_SETTINGS`          | `1`                     | 跳过举报·反垃圾·引用通告(005)场景(`tests/e2e/moderation-*`)。表示 backend 以下面的 005 测试设置启动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` | 管理员账号              | 跳过管理控制台和发布说明场景。该账号使用与 backend 的 `BLOG_ADMIN_BOOTSTRAP_SUPER_ADMIN_EMAIL` 相同的邮箱注册                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `E2E_ADMIN_TEST_SETTINGS`               | `1`                     | 跳过举报·反垃圾·引用通告(005)场景(`tests/e2e/moderation-*`)会改变违禁词、运营设置等全站值,因此在 Playwright 项目 `moderation` 中于 `portal` 之后逐个文件运行。所有场景都从同一 IP(localhost)注册·评论·发布·上传·举报·发送引用通告,所以要用下列值启动 backend 并设置 `E2E_MODERATION_TEST_SETTINGS=1`(注册的 IP 限制保持默认值时,001~004 场景也会卡在注册): `BLOG_CAPTCHA_PROVIDER=test`, `BLOG_CAPTCHA_LOGIN_FAILURES_BEFORE_CAPTCHA=100000`, `BLOG_RATELIMIT_SIGNUP_PER_IP_PER_HOUR=100000`, `BLOG_RATELIMIT_COMMENT_PER_MINUTE=1000`, `BLOG_RATELIMIT_GUESTBOOK_PER_MINUTE=1000`, `BLOG_RATELIMIT_POST_PUBLISH_PER_HOUR=100000`, `BLOG_RATELIMIT_MEDIA_UPLOAD_PER_MINUTE=1000`, `BLOG_TRACKBACK_RECEIVE_LIMIT=100000`, `BLOG_REPORTS_MEMBER_PER_HOUR=100000`, `BLOG_REPORTS_RIGHTS_REQUEST_PER_IP_PER_HOUR=100000`。CAPTCHA 的 `test` 只放行令牌 `e2e-pass`,front 的测试用组件和 E2E 辅助脚本(`scripts/e2e-provision-admin.sh`、`tests/e2e/support/backend.ts`)会发送它。调高登录 CAPTCHA 阈值,是为了让 001 的登录锁定场景不被同一 IP 连续失败 3 次的规则拦住。引用通告发送场景要求 backend 的 `blog.base-url` 与 front 地址相同,才会被当作站内文章处理(local 配置默认 `http://localhost:5173`,其他端口用 `BLOG_BASE_URL`)。 |
| `E2E_EXTERNAL_TEST_SETTINGS`            | `1`                     | 跳过外部博客(007)场景(`tests/e2e/external-*`)。表示 backend 已按下面的 007 测试设置启动                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `E2E_FEED_STUB_PORT`                    | `4610`                  | E2E 订阅源桩服务器端口(默认 4610)。在 backend 的 `BLOG_OUTBOUND_ALLOWED_PORTS` 中加入同一端口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

管理控制台(006)场景(`tests/e2e/admin-*`)。表示 backend 以 `BLOG_ADMIN_DASHBOARD_CACHE_TTL=0s`(关闭仪表板缓存)启动 |

外部博客(007)场景(`tests/e2e/external-*`)会把外部文章混入门户“最新文章”并修改运营设置,因此在 Playwright 项目 `external` 中最后逐个文件运行。订阅源不来自互联网,而是由 `playwright.config.ts` 的 `webServer` 一并启动的订阅源桩(`tests/e2e/support/feed-stub-server.mjs`,`127.0.0.1:${E2E_FEED_STUB_PORT}`,健康检查 `/__stub/health`)提供。场景通过 `/__stub/{名称}` 设置订阅源内容、验证码和响应状态。backend 以下列值启动,并设置 `E2E_EXTERNAL_TEST_SETTINGS=1`:`BLOG_OUTBOUND_ALLOW_PRIVATE=true`(允许回环地址的桩,**仅用于测试**,prod 配置下会启动失败)、`BLOG_OUTBOUND_ALLOWED_PORTS=80,443,8080,8443,4610`、`BLOG_EXTERNAL_POLL_INTERVAL=2s`、`BLOG_EXTERNAL_FETCH_INTERVAL=PT5S`、`BLOG_EXTERNAL_FETCH_JITTER=PT0S`、`BLOG_EXTERNAL_PREVIEW_PER_HOUR=1000`、`BLOG_EXTERNAL_VERIFY_CHECKS_PER_HOUR=1000`。为了让门户立即反映变化,还需要 `BLOG_PORTAL_CACHE_TTL=0s`(003 设置)。举报关联场景(`external-us4-report`)还会用到 005 设置和 `E2E_MODERATION_TEST_SETTINGS=1`。

要连同 backend 全部运行，请按 backend README 启动 MySQL（已导入表结构）、Mailpit 和 backend（local profile），然后：

```bash
E2E_BACKEND_URL=http://localhost:8080 MAILPIT_URL=http://localhost:8025 npm run e2e
```

门户（003）场景需要以测试设置启动 backend：`BLOG_PORTAL_CACHE_TTL=0s`（关闭缓存）、`BLOG_PORTAL_NEW_MEMBER_DELAY=PT0S`（注册后立即展示）、`BLOG_PORTAL_TOPIC_AUTO_HIDE_THRESHOLD=1`，以及第一位管理员 `BLOG_ADMIN_BOOTSTRAP_SUPER_ADMIN_EMAIL=<管理员邮箱>`（该值只放在 `.env` 中，不要提交）。front 测试地址（默认 `http://localhost:5173`）必须包含在 backend 的 `blog.security.allowed-origins` 中。然后：

```bash
E2E_BACKEND_URL=http://localhost:8080 E2E_PORTAL_TEST_SETTINGS=1 \
  E2E_ADMIN_EMAIL=<管理员邮箱> E2E_ADMIN_PASSWORD=<密码> npm run e2e
```

004 博客功能场景（`tests/e2e/blog-*`）使用 backend local 配置的默认值运行。非会员写入场景会从同一 IP（localhost）多次写入，因此需放宽写入频率限制启动 backend，并设置 `E2E_GUEST_TEST_SETTINGS=1`（004 的 `BLOG_GUEST_*_PER_MINUTE` 已改为 005 的 `BLOG_RATELIMIT_*`，见下面的 005 设置）。备份场景中 backend 会把 zip 写到 `BLOG_DATA_DIR`/exports（local 默认 `./data/exports`）。定时发布和备份场景需要等待批处理周期（30 秒），因此需要 1～2 分钟。

门户场景查看全站唯一的画面（首页"最新文章"、推荐、门户设置），因此作为 Playwright 项目 `portal` 在其余场景（`e2e`）结束后一次一个文件地运行。CI（`ci.yml` 的 e2e-backend、`e2e.yml`）以上述测试设置启动 backend，并用 `scripts/e2e-provision-admin.sh` 在一次性数据库中创建管理员账号（注册 API → 将 `role` 改为 SUPER_ADMIN）。

管理控制台(006)场景(`tests/e2e/admin-*`)会改变授予·撤销权限、发布版本说明等全站状态,因此在 Playwright 项目 `admin` 中于 `portal`·`moderation` 之后逐个文件运行。仪表板数值需要立即变化,所以用 `BLOG_ADMIN_DASHBOARD_CACHE_TTL=0s` 启动 backend 并设置 `E2E_ADMIN_TEST_SETTINGS=1`。管理员账号必须是最高管理员,场景不会更改该账号自身的权限。

未设置 `CI` 时，会复用同一端口上已在运行的 front 服务器。每次运行都会创建新账号，因此可以在同一个数据库上反复运行。

## 目录结构

```text
server.ts                 # Express 入口：X-Request-Id、backend 代理、安全响应头、静态文件、React Router
server/app.ts             # React Router 请求处理器（构建时打包进 build/server），通过 load context 传递 CSP nonce
server/middleware/        # request-id、backend-proxy
app/entry.server.tsx      # SSR 入口（React Router 默认 + CSP nonce）
app/root.tsx              # 公共布局（页眉、页脚）、登录会员与语言的确定（root loader）、错误边界
app/server/               # 安全响应头（CSP、HSTS 等）、load context
app/auth/                 # 会话辅助函数（getSessionUser、requireUser、next 校验）
app/components/layout/    # Header、Footer
app/routes.ts             # 路由定义（依据 blog-docs contracts/routes.md）
app/routes/               # 路由模块
app/api/                  # backend 客户端（client.server.ts）、公共响应类型、ApiError、错误码 → 文案（errorMessage.ts）
app/i18n/                 # i18next 配置、语言确定
app/locales/{ko,en,ja,zh-CN}/*.json   # 翻译文件（基准语言 ko）
tests/unit/               # Vitest
tests/e2e/                # Playwright
```

## 规则摘要

- 浏览器只调用 front 服务器。`/api/**`、`/media/**`、订阅源（`/:handle/rss` 等）、引用通告（trackback）、站点地图和 robots 由 front 服务器转发给 backend，浏览器的 `Origin` 和 Cookie 原样传递。
- SSR 的 loader、action 通过 `createApiClient(request)` 直接调用 backend，转发 Cookie、`Accept-Language`、`Origin`、`X-Request-Id`，返回响应中的 `result`，失败时抛出 `ApiError`（status、resultCode、fieldErrors、traceId）。
- 界面文案不写在代码里，而是使用 `app/locales` 中的键。新文案的四种语言放在同一个 PR 中。API 错误用 `errors:{code}`，输入错误用 `errors:fieldErrors.{code}` 显示，未知错误码回退为通用文案。
- front 服务器为 HTML 响应添加安全响应头（blog-docs research.md R27）：使用每请求 nonce 的 CSP、`X-Content-Type-Options: nosniff`、`Referrer-Policy`，仅生产环境启用 HSTS。服务器渲染的 `<script>` 会带上相同的 nonce，因此不要手写内联脚本。
- `dangerouslySetInnerHTML` 只用于显示已清理的文章正文（`app/components/post/PostContent.tsx`），其他文件中由 ESLint 禁止。
- 需要登录的页面的 loader 调用 `requireUser(request)`。未登录时跳转到 `/login?next={当前路径}`，`next` 只接受同站点的相对路径（`safeNextPath`）。
- 界面语言按 会员设置 → Cookie `lang` → `Accept-Language` → 英语 的顺序确定。URL 中不加语言前缀。

## 文档

- 规格：[blog-docs/specs](https://github.com/marco-blog/blog-docs/tree/main/specs) —— 核心功能见 [specs/001-blog-core](https://github.com/marco-blog/blog-docs/tree/main/specs/001-blog-core)（spec、contracts/routes.md、contracts/api.md、quickstart.md）
- backend 运维文档（环境变量、备份、定时任务）：[blog-backend docs/operations.md](https://github.com/marco-blog/blog-backend/blob/main/docs/operations.md)
- API 规范：[blog-docs/api-guidelines.md](https://github.com/marco-blog/blog-docs/blob/main/api-guidelines.md)
- 开发规则：[CLAUDE.md](CLAUDE.md)，原则见 blog-docs `.specify/memory/constitution.md`
