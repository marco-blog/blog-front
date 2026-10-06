import { type RouteConfig, index, route } from "@react-router/dev/routes";

/**
 * 라우트 정의(blog-docs/specs/001-blog-core/contracts/routes.md).
 * 최상위 경로를 추가하면 같은 PR에서 예약어 목록(routes.md, backend 상수)도 고친다.
 * 맨 끝의 `*`는 어디에도 맞지 않는 주소를 404로 응답한다.
 */
export default [index("routes/home.tsx"), route("*", "routes/not-found.tsx")] satisfies RouteConfig;
