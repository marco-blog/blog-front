import type { NextFunction, Request, Response } from "express";

/** 관리 화면 응답에 붙이는 검색 엔진 제외 헤더(006 FR-098) */
export const ROBOTS_HEADER = "X-Robots-Tag";
export const ROBOTS_NOINDEX = "noindex, nofollow";

/**
 * 관리 화면인지: 경로의 첫 조각이 `admin`·`manage`이거나 둘째 조각이 `manage`(`/:handle/manage/**`).
 * React Router 데이터 요청(`/marco/manage/posts.data`)도 같은 화면으로 본다.
 */
export function isManagementPath(pathname: string): boolean {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/\.data$/, ""));
  return (
    segments[0] === "admin" ||
    segments[0] === "manage" ||
    (segments.length >= 2 && segments[1] === "manage")
  );
}

/**
 * 관리 화면의 모든 응답(200·302·404 등 종류와 무관)에 `X-Robots-Tag: noindex, nofollow`를 붙인다(006 FR-098, research A11).
 * meta noindex는 HTML에만 들어가므로 리다이렉트·오류·데이터 응답까지 막으려고 헤더로도 보낸다. React Router 처리기보다 앞에 둔다.
 */
export function robotsHeader() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isManagementPath(req.path)) {
      res.setHeader(ROBOTS_HEADER, ROBOTS_NOINDEX);
    }
    next();
  };
}
