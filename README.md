# blog-front

**한국어** | [English](README.en.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[blog.java21.net](https://blog.java21.net)에서 운영하는 멀티 유저 블로그 플랫폼(티스토리와 비슷한 서비스)의 React SSR 프런트엔드다.
블로그 홈·글 상세·목록 같은 공개 화면을 서버에서 렌더링하고(JS 없이도 본문과 메타 태그가 HTML에 있음), 글쓰기·블로그 관리·계정 설정 화면을 제공한다.
API는 형제 저장소 [blog-backend](https://github.com/marco-blog/blog-backend)(Spring Boot)가 맡고, 스펙은 [blog-docs](https://github.com/marco-blog/blog-docs)에 있다.

## 스택

- React 19 + TypeScript, Vite, React Router 8 framework 모드(SSR), 커스텀 Express 5 서버(`server.ts`)
- 글 에디터: Milkdown Crepe(작성 화면에서만 브라우저로 불러옴), 코드 강조: highlight.js(SSR)
- 다국어: i18next + react-i18next, 4개 언어(ko·en·ja·zh-CN)
- 테스트: Vitest + Testing Library(라인 커버리지 80% 이상), Playwright(E2E), ESLint, Prettier

## 요구 사항

- Node.js 22.18 이상(22 LTS). 서버 진입점 `server.ts`를 Node의 TypeScript 실행 기능으로 바로 띄운다.
- backend(`blog-backend`)가 `http://localhost:8080`에서 실행 중이어야 API·이미지 요청이 동작한다. 첫 화면과 404 화면은 backend 없이도 뜬다. backend 실행 방법은 [blog-backend README](https://github.com/marco-blog/blog-backend#readme)를 본다.
- 세 저장소를 형제 디렉터리로 두면 문서의 상대 경로가 맞는다: `blog/blog-docs`, `blog/blog-backend`, `blog/blog-front`

## 실행

```bash
npm install
cp .env.example .env      # 필요하면 값 수정
npm run dev               # 개발 서버 http://localhost:5173 (Vite HMR)
```

운영 빌드와 실행:

```bash
npm run build             # build/client, build/server 생성
npm start                 # NODE_ENV=production으로 build 산출물 실행
```

## 환경 변수

`.env`가 있으면 `npm run dev`·`npm start`가 읽는다(`node --env-file-if-exists`). `.env`는 커밋하지 않고 `.env.example`만 둔다. 비밀 값은 없다.

| 이름                | 기본값                                                    | 설명                                                                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOG_BACKEND_URL`  | `http://localhost:8080`                                   | backend 주소. `/api/**`·`/media/**` 등 프록시 대상이며, SSR loader·action이 직접 호출하는 주소                                                                                                                                                                                  |
| `PORT`              | `5173`                                                    | front 서버 포트. backend의 허용 Origin(로컬 `http://localhost:5173`, `http://localhost:3000`)에 맞춘다                                                                                                                                                                          |
| `BLOG_PUBLIC_URL`   | 들어온 요청의 주소                                        | 사이트의 공개 주소(scheme+host). SSR이 backend에 보내는 POST(토큰 갱신·조회수)의 `Origin`. backend의 `blog.base-url`과 같게 둔다                                                                                                                                                |
| `BLOG_KAKAO_JS_KEY` | 없음(카카오톡 버튼 숨김)                                  | Kakao JavaScript 키(카카오톡 공유). 공개 값이지만 Kakao Developers 앱의 Web 플랫폼 사이트 도메인에 서비스 주소(운영 `https://blog.java21.net`)를 등록해야 동작한다. 값이 있을 때만 CSP에 `https://t1.kakaocdn.net`(script-src)과 `https://kapi.kakao.com`(connect-src)을 더한다 |
| `NODE_ENV`          | `npm run dev`는 `development`, `npm start`는 `production` | 개발 모드에서는 Vite 미들웨어로 렌더링한다                                                                                                                                                                                                                                      |

카카오톡 공유는 SDK를 `app/share/kakao.client.ts`에 고정한 버전·SRI 해시로 처음 누를 때만 불러온다. SDK 버전을 올리면 Kakao Developers 문서의 integrity 값으로 함께 바꾼다.

## 검사·테스트

```bash
npm run lint              # ESLint
npm run format:check      # Prettier (고칠 때는 npm run format)
npm run typecheck         # 라우트 타입 생성 + tsc
npm test -- --coverage    # Vitest + 커버리지. 라인 80% 미만이면 실패(커버리지는 vitest.config.ts에서 늘 켜져 있어 npm test도 같다)
npm run build
```

- 커버리지 보고서: `coverage/index.html`
- 번역 누락 점검(`tests/unit/i18n/translations.test.ts`)은 `npm test`에 포함되며, 4개 언어 중 하나라도 키가 빠지거나 값이 비면 실패한다.
- CI(`.github/workflows/ci.yml`)는 PR과 `main` 푸시마다 위 검사와 빌드, backend 없이 도는 E2E(smoke)를 돌리고, `e2e-backend` 작업에서 backend `main`과 일회용 MySQL을 띄워 backend가 필요한 E2E를 돌린다.

## E2E (Playwright)

```bash
npx playwright install chromium      # 처음 한 번
npm run e2e                          # = npx playwright test
```

`playwright.config.ts`가 `npm run build && npm start`로 front 서버를 띄워(`E2E_PORT`, 기본 5173) 검사한다. 환경 변수에 따라 도는 시나리오가 다르다.

| 환경 변수         | 예                      | 없으면                                                                                                                            |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| (없음)            |                         | 첫 화면·404·보안 헤더 같은 smoke 시나리오만 돈다                                                                                  |
| `E2E_BACKEND_URL` | `http://localhost:8080` | 가입·글·카테고리·댓글·이미지·언어 시나리오(`tests/e2e/us*`)를 건너뛴다. 있으면 front 서버도 이 backend를 본다(`BLOG_BACKEND_URL`) |
| `MAILPIT_URL`     | `http://localhost:8025` | 비밀번호 재설정 메일을 읽는 시나리오를 건너뛴다(backend가 같은 Mailpit으로 메일을 보내야 한다)                                    |

backend까지 포함해 모두 돌리려면 backend README대로 MySQL(스키마 적용)·Mailpit·backend(local 프로필)를 띄운 뒤:

```bash
E2E_BACKEND_URL=http://localhost:8080 MAILPIT_URL=http://localhost:8025 npm run e2e
```

`CI`가 없으면 이미 떠 있는 front 서버(같은 포트)를 다시 쓴다. 시나리오는 실행마다 새 계정을 만들므로 같은 DB에서 여러 번 돌려도 된다.

## 구조

```text
server.ts                 # Express 진입점: X-Request-Id, backend 프록시, 보안 헤더, 정적 파일, React Router
server/app.ts             # React Router 요청 처리기(빌드 시 build/server로 묶임), CSP nonce를 load context로 전달
server/middleware/        # request-id, backend-proxy
app/entry.server.tsx      # 서버 렌더링 진입점(React Router 기본 + CSP nonce)
app/root.tsx              # 공통 레이아웃(상단·하단), 로그인 회원·언어 결정(root loader), 오류 경계
app/server/               # 보안 헤더(CSP·HSTS 등), load context
app/auth/                 # 세션 도우미(getSessionUser, requireUser, next 검증)
app/components/layout/    # Header, Footer
app/routes.ts             # 라우트 정의(blog-docs contracts/routes.md 기준)
app/routes/               # 라우트 모듈
app/api/                  # backend 호출 클라이언트(client.server.ts), 공통 응답 타입, ApiError, 오류 코드 → 문구(errorMessage.ts)
app/i18n/                 # i18next 설정, 언어 결정
app/locales/{ko,en,ja,zh-CN}/*.json   # 번역 파일(기준 언어 ko)
tests/unit/               # Vitest
tests/e2e/                # Playwright
```

## 규칙 요약

- 브라우저는 front 서버만 호출한다. `/api/**`, `/media/**`, 피드(`/:handle/rss` 등), 트랙백, 사이트맵·robots는 front 서버가 backend로 넘긴다. 브라우저의 `Origin`·쿠키는 바꾸지 않고 전달한다.
- SSR loader·action은 `createApiClient(request)`로 backend를 직접 부른다. 쿠키·`Accept-Language`·`Origin`·`X-Request-Id`를 전달하고, 응답의 `result`를 돌려주며 실패하면 `ApiError`(status, resultCode, fieldErrors, traceId)를 던진다.
- 화면 문구는 코드에 쓰지 않고 `app/locales`의 키로 쓴다. 새 문구는 4개 언어를 같은 PR에 넣는다. API 오류는 `errors:{code}`, 입력 오류는 `errors:fieldErrors.{code}`로 보여주며 모르는 코드는 일반 문구로 대체한다.
- front 서버가 HTML 응답에 보안 헤더를 붙인다(blog-docs research.md R27): 요청별 nonce를 쓰는 CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, 운영에서만 HSTS. 서버 렌더링한 `<script>`에는 같은 nonce가 붙으므로 인라인 스크립트를 직접 넣지 않는다.
- `dangerouslySetInnerHTML`은 sanitize된 글 본문 표시(`app/components/post/PostContent.tsx`)에서만 쓴다. ESLint가 다른 파일에서 막는다.
- 로그인이 필요한 화면의 loader는 `requireUser(request)`를 부른다. 비로그인이면 `/login?next={현재 경로}`로 보내며, `next`는 같은 사이트 상대 경로만 받는다(`safeNextPath`).
- 화면 언어는 회원 설정 → 쿠키 `lang` → `Accept-Language` → 영어 순으로 정한다. 주소에 언어 접두어를 넣지 않는다.

## 문서

- 스펙: [blog-docs/specs](https://github.com/marco-blog/blog-docs/tree/main/specs) — 001 핵심 기능은 [specs/001-blog-core](https://github.com/marco-blog/blog-docs/tree/main/specs/001-blog-core)(spec, contracts/routes.md, contracts/api.md, quickstart.md)
- backend 운영 문서(환경 변수, 백업, 정기 작업): [blog-backend docs/operations.md](https://github.com/marco-blog/blog-backend/blob/main/docs/operations.md)
- API 규칙: [blog-docs/api-guidelines.md](https://github.com/marco-blog/blog-docs/blob/main/api-guidelines.md)
- 개발 규칙: [CLAUDE.md](CLAUDE.md), 원칙은 blog-docs `.specify/memory/constitution.md`
