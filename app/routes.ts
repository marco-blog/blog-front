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
  // 007 알림 링크용(최근 블로그의 외부 블로그 관리로)
  route("manage/external-blogs", "routes/manage-external-entry.ts", { id: "manage-external-list" }),
  route("manage/external-blogs/:id", "routes/manage-external-entry.ts", {
    id: "manage-external-detail",
  }),
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
  // 003 시스템 관리자 콘솔(관리자만, 아니면 404). 006 대시보드가 첫 화면이고 나머지 메뉴를 더한다.
  route("admin", "routes/admin/layout.tsx", [
    index("routes/admin/dashboard.tsx"),
    route("topics", "routes/admin/topics.tsx"),
    route("portal/curations", "routes/admin/curations.tsx"),
    route("portal/exclusions", "routes/admin/exclusions.tsx"),
    route("portal/settings", "routes/admin/settings.tsx"),
    // 005 신고·회원(숨긴 글 옛 주소는 006 콘텐츠 관리로 리다이렉트)
    route("reports", "routes/admin/reports.tsx"),
    route("reports/:id", "routes/admin/report.tsx"),
    route("users", "routes/admin/users.tsx"),
    route("users/:id", "routes/admin/user.tsx"),
    route("contents/hidden-posts", "routes/admin/hidden-posts.ts"),
    route("spam", "routes/admin/spam.tsx"),
    // 006 콘텐츠 관리·예약어·서비스 설정·관리자 권한·작업 기록·릴리스 노트
    route("contents", "routes/admin/contents.tsx"),
    route("contents/posts", "routes/admin/contents.posts.tsx"),
    route("contents/comments", "routes/admin/contents.comments.tsx"),
    route("contents/guestbook", "routes/admin/contents.guestbook.tsx"),
    route("reserved-handles", "routes/admin/reserved-handles.tsx"),
    route("settings", "routes/admin/service-settings.tsx"),
    route("admins", "routes/admin/admins.tsx"),
    route("audit-log", "routes/admin/audit-log.tsx"),
    route("audit-log/:id", "routes/admin/audit-log-entry.tsx"),
    route("release-notes", "routes/admin/release-notes.tsx"),
    route("release-notes/new", "routes/admin/release-note-edit.tsx", {
      id: "admin-release-note-new",
    }),
    route("release-notes/:id", "routes/admin/release-note-edit.tsx", {
      id: "admin-release-note-edit",
    }),
    route("release-notes/:id/revisions", "routes/admin/release-note-revisions.tsx"),
    route("release-notes/:id/revisions/:revisionNo", "routes/admin/release-note-revision.tsx"),
    // 007 외부 블로그 관리
    route("external-blogs", "routes/admin/external-blogs.tsx"),
    route("external-blogs/new", "routes/admin/external-blog-new.tsx"),
    route("external-blogs/reviews", "routes/admin/external-reviews.tsx"),
    route("external-blogs/stats", "routes/admin/external-stats.tsx"),
    route("external-blogs/rules", "routes/admin/external-rules.tsx"),
    route("external-blogs/settings", "routes/admin/external-settings.tsx"),
    route("external-blogs/:id", "routes/admin/external-blog.tsx"),
  ]),

  // 블로그 주소 아래. `:postId`가 숫자인지는 loader가 검사한다(React Router는 정규식 경로가 없다).
  // 글쓰기·관리는 공개 블로그 레이아웃 밖(방문을 세지 않고 블로그 메뉴·사이드바 없음, 004).
  route(":handle/write/:postId?", "routes/write.tsx"),
  route(":handle/manage", "routes/manage/layout.tsx", [
    index("routes/manage/dashboard.tsx"),
    route("posts", "routes/manage/posts.tsx"),
    route("categories", "routes/manage/categories.tsx"),
    route("comments", "routes/manage/comments.tsx"),
    route("trackbacks", "routes/manage/trackbacks.tsx"),
    route("guestbook", "routes/manage/guestbook.tsx"),
    route("design", "routes/manage/design.tsx"),
    route("stats", "routes/manage/stats.tsx"),
    route("backup", "routes/manage/backup.tsx"),
    route("blocks", "routes/manage/blocks.tsx"),
    route("settings", "routes/manage/settings.tsx"),
    route("feed", "routes/manage/feed.tsx"),
    // 007 외부 블로그
    route("external-blogs", "routes/manage/external-blogs.tsx"),
    route("external-blogs/new", "routes/manage/external-blog-new.tsx"),
    route("external-blogs/:id", "routes/manage/external-blog.tsx"),
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
