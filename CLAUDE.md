# front

Blog Platform의 React SSR 프런트엔드. 스펙은 형제 저장소 `../blog-docs/specs/`에 있고, 원칙은 `../blog-docs/.specify/memory/constitution.md`를 따른다.

## 스택
- 이름: `net.java21.blog.front` (package.json name)
- React + Vite + TypeScript, React Router framework 모드
- SSR: React Router framework 모드(Vite 플러그인). 공개 페이지 데이터는 라우트 `loader`에서 서버 조회, 메타 태그는 라우트 `meta`
- 명령(앱 생성 후): `npm run dev`, `npm run build`, `npm run start`, `npm test`
- API 타입은 backend OpenAPI에서 생성한다(손으로 작성하지 않음).
- 테스트: Vitest + Testing Library, Playwright. 라인 커버리지 80% 이상(Vitest coverage threshold)

## 규칙
- 공개 페이지(블로그 홈, 글 상세, 목록)는 서버 렌더링. JS 없이도 본문과 메타 태그가 HTML에 있어야 한다.
- 비즈니스 로직은 두지 않고 backend API를 호출한다.
- 토큰은 HttpOnly 쿠키에 보관하고 서버 렌더링 시 backend로 전달한다.
- 글 에디터: Milkdown Crepe. 브라우저 전용이므로 작성 화면에서만 클라이언트로 불러온다(SSR 대상 아님). 다른 화면은 에디터 라이브러리를 직접 import하지 않고 `components/Editor` 래퍼만 쓴다.
- 스펙(tasks.md)에 없는 기능은 구현하지 않는다.

## 다국어
- 지원 언어: ko, en, ja, zh-CN. 화면 문구를 코드에 직접 쓰지 않고 `app/locales/{lang}/*.json`의 키로 쓴다.
- 새 문구는 4개 언어를 같은 PR에 넣는다. 번역 누락 점검 테스트가 실패하면 머지하지 않는다.
- backend 오류는 `code`로 받고, 문구는 `errors.{code}` 키로 보여준다.
