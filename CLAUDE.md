# front

Blog Platform의 React SSR 프런트엔드. 스펙은 형제 저장소 `../docs/specs/`에 있고, 원칙은 `../docs/.specify/memory/constitution.md`를 따른다.

## 스택
- 이름: `net.java21.blog.front` (package.json name)
- Next.js(App Router) + TypeScript (React SSR)
- API 타입은 backend OpenAPI에서 생성한다(손으로 작성하지 않음).
- 테스트: Vitest, Playwright

## 규칙
- 공개 페이지(블로그 홈, 글 상세, 목록)는 서버 렌더링. JS 없이도 본문과 메타 태그가 HTML에 있어야 한다.
- 비즈니스 로직은 두지 않고 backend API를 호출한다.
- 토큰은 HttpOnly 쿠키에 보관하고 서버 렌더링 시 backend로 전달한다.
- 스펙(tasks.md)에 없는 기능은 구현하지 않는다.
