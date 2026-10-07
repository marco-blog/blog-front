import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

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
  route("password-reset", "routes/password-reset.tsx"),
  route("password-reset/confirm", "routes/password-reset.confirm.tsx"),
  route("terms", "routes/terms.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("locale", "routes/locale.ts"),
  route("write", "routes/write-entry.ts"),
  route("manage", "routes/manage-entry.ts"),
  route("settings", "routes/settings.tsx", [
    index("routes/settings._index.ts"),
    route("profile", "routes/settings.profile.tsx"),
    route("password", "routes/settings.password.tsx"),
    route("login-history", "routes/settings.login-history.tsx"),
    route("blogs", "routes/settings.blogs.tsx"),
    route("language", "routes/settings.language.tsx"),
  ]),
  route("tags/:name", "routes/tag.tsx"),
  route("feed", "routes/feed.tsx"),
  route("notifications", "routes/notifications.tsx"),
  route("search", "routes/search.tsx"),
  // 005 권리 침해 신고(비회원도). 예약어(rights-request)라 `/:handle`과 겹치지 않는다.
  route("rights-request", "routes/rights-request.tsx"),
  // 003 주제 페이지(대분류·소분류 공용 모듈). `/:handle` 계열보다 앞에 둔다.
  route("topics/:major", "routes/topic.tsx", { id: "topic-major" }),
  route("topics/:major/:minor", "routes/topic.tsx", { id: "topic-minor" }),
  // 003 릴리스 노트 위키(`/updates/v1.2.3`). 버전 조각은 loader가 `v` + SemVer인지 검사한다.
  route("updates", "routes/updates/layout.tsx", [
    index("routes/updates/index.tsx"),
    route("seen", "routes/updates/seen.ts"),
    route(":version", "routes/updates/version.tsx"),
    route(":version/history", "routes/updates/history.tsx"),
    route(":version/history/:revisionNo", "routes/updates/revision.tsx"),
  ]),
  // 003 시스템 관리자 콘솔(관리자만, 아니면 404). 006이 나머지 메뉴를 더한다.
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/index.ts"),
    route("topics", "routes/admin/topics.tsx"),
    route("portal/curations", "routes/admin/curations.tsx"),
    route("portal/exclusions", "routes/admin/exclusions.tsx"),
    route("portal/settings", "routes/admin/settings.tsx"),
    // 005 신고·회원·숨긴 글
    route("reports", "routes/admin/reports.tsx"),
    route("reports/:id", "routes/admin/report.tsx"),
    route("users", "routes/admin/users.tsx"),
    route("users/:id", "routes/admin/user.tsx"),
    route("contents/hidden-posts", "routes/admin/hidden-posts.tsx"),
  ]),

  // 블로그 주소 아래. `:postId`가 숫자인지는 loader가 검사한다(React Router는 정규식 경로가 없다).
  // 글쓰기·관리는 공개 블로그 레이아웃 밖(방문을 세지 않고 블로그 메뉴·사이드바 없음, 004).
  route(":handle/write/:postId?", "routes/write.tsx"),
  route(":handle/manage", "routes/manage/layout.tsx", [
    index("routes/manage/dashboard.tsx"),
    route("posts", "routes/manage/posts.tsx"),
    route("categories", "routes/manage/categories.tsx"),
    route("comments", "routes/manage/comments.tsx"),
    route("guestbook", "routes/manage/guestbook.tsx"),
    route("design", "routes/manage/design.tsx"),
    route("stats", "routes/manage/stats.tsx"),
    route("backup", "routes/manage/backup.tsx"),
    route("blocks", "routes/manage/blocks.tsx"),
    route("settings", "routes/manage/settings.tsx"),
    route("feed", "routes/manage/feed.tsx"),
  ]),
  // 004 공개 블로그 레이아웃(경로 없음): 블로그 메뉴·사이드바. 고정 이름 경로를 `:handle/:postId`보다 앞에 둔다.
  layout("routes/blog/layout.tsx", [
    route(":handle", "routes/blog-home.tsx"),
    route(":handle/category/:categoryId", "routes/blog-category.tsx"),
    route(":handle/tags", "routes/blog-tags.tsx"),
    route(":handle/tags/:name", "routes/blog-tag.tsx"),
    route(":handle/notice", "routes/blog-notice.tsx"),
    route(":handle/archive/:year/:month", "routes/blog-archive.tsx"),
    route(":handle/search", "routes/blog-search.tsx"),
    route(":handle/guestbook", "routes/blog-guestbook.tsx"),
    route(":handle/:postId", "routes/post-detail.tsx"),
  ]),

  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
