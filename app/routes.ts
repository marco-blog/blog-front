import { type RouteConfig, index, route } from "@react-router/dev/routes";

/**
 * 라우트 정의(blog-docs/specs/001-blog-core/contracts/routes.md "001 화면").
 * 고정 경로를 먼저, 블로그 주소(`/:handle/...`) 계열을 마지막에 둔다(R5).
 * 최상위 경로를 추가하면 같은 PR에서 예약어 목록(routes.md, backend 상수)도 고친다(tests/unit/routes/reservedPaths.test.ts).
 * 맨 끝의 `*`는 어디에도 맞지 않는 주소를 404로 응답한다.
 */
export default [
  index("routes/home.tsx"),
  route("signup", "routes/signup.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.ts"),
  route("write", "routes/write-entry.ts"),
  route("manage", "routes/manage-entry.ts"),
  route("settings", "routes/settings.tsx", [
    index("routes/settings._index.ts"),
    route("blogs", "routes/settings.blogs.tsx"),
  ]),

  // 블로그 주소 아래. `:postId`가 숫자인지는 loader가 검사한다(React Router는 정규식 경로가 없다).
  route(":handle", "routes/blog-home.tsx"),
  route(":handle/write/:postId?", "routes/write.tsx"),
  route(":handle/manage", "routes/manage/layout.tsx", [
    index("routes/manage/dashboard.tsx"),
    route("posts", "routes/manage/posts.tsx"),
    route("comments", "routes/manage/comments.tsx"),
    route("settings", "routes/manage/settings.tsx"),
  ]),
  route(":handle/:postId", "routes/post-detail.tsx"),

  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
