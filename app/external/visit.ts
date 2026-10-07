import type { PortalCard } from "~/api/models";

/** 외부 글 원문 이동 주소(007 research E14): backend가 클릭을 센 뒤 원문으로 302. front 프록시가 그대로 넘긴다. */
export function visitPath(externalPostId: number): string {
  return `/api/v1/external-posts/${externalPostId}/visit`;
}

/** 카드의 이동 주소. backend가 준 `visitUrl`을 쓰고, 없으면 같은 규칙으로 만든다. */
export function visitHref(card: Pick<PortalCard, "id" | "visitUrl">): string {
  return card.visitUrl ?? visitPath(card.id);
}

/** 프록시가 404를 HTML 404 화면으로 바꾸는 경로(contracts/routes.md, 이 경로 한 곳만) */
export const VISIT_PATH_PATTERN = /^\/api\/v1\/external-posts\/[^/]+\/visit$/;
