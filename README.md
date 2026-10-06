# blog-front

**한국어** | [English](README.en.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

Blog Platform(`blog.java21.net`)의 React SSR 프런트엔드. React + Vite + TypeScript, React Router framework 모드(SSR)와 커스텀 Express 서버로 동작한다.
스펙과 원칙은 형제 저장소 `blog-docs`(`specs/`, `.specify/memory/constitution.md`)를 따른다.

## 요구 사항

- Node.js 22.18 이상(22 LTS). 서버 진입점 `server.ts`를 Node의 TypeScript 실행 기능으로 바로 띄운다.
- backend(`blog-backend`)가 `http://localhost:8080`에서 실행 중이어야 API·이미지 요청이 동작한다. 첫 화면과 404 화면은 backend 없이도 뜬다.

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

`.env`가 있으면 `npm run dev`·`npm start`가 읽는다(`node --env-file-if-exists`). `.env`는 커밋하지 않고 `.env.example`만 둔다.

| 이름               | 기본값                                                    | 설명                                                                                                   |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `BLOG_BACKEND_URL` | `http://localhost:8080`                                   | backend 주소. `/api/**`·`/media/**` 등 프록시 대상이며, SSR loader·action이 직접 호출하는 주소         |
| `PORT`             | `5173`                                                    | front 서버 포트. backend의 허용 Origin(로컬 `http://localhost:5173`, `http://localhost:3000`)에 맞춘다 |
| `NODE_ENV`         | `npm run dev`는 `development`, `npm start`는 `production` | 개발 모드에서는 Vite 미들웨어로 렌더링한다                                                             |

## 검사

```bash
npm run typecheck         # 라우트 타입 생성 + tsc
npm run lint              # ESLint
npm run format:check      # Prettier (고칠 때는 npm run format)
npm test                  # Vitest + 커버리지. 라인 80% 미만이면 실패
npm run e2e               # Playwright. 빌드 후 서버를 띄워 검사(E2E_PORT로 포트 변경)
```

번역 누락 점검(`tests/unit/i18n/translations.test.ts`)은 `npm test`에 포함되며, 4개 언어 중 하나라도 키가 빠지거나 값이 비면 실패한다.

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
