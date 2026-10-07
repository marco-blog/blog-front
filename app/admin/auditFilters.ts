import { AUDIT_ACTION_GROUPS, GROUP_PREFIX, actionQuery } from "./auditActions";

/** 작업 기록 조건(006 contracts/routes.md `/admin/audit-log?from=&to=&adminId=&action=&targetType=&targetId=&targetKey=&page=`) */
export interface AuditFilters {
  from: string;
  to: string;
  adminId: string;
  /** 작업 코드 하나 또는 묶음(`group:topic`) */
  action: string;
  targetType: string;
  targetId: string;
  targetKey: string;
  page: number;
}

export const AUDIT_PAGE_SIZE = 20;
export const AUDIT_PATH = "/admin/audit-log";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^\d{1,18}$/;
const KEY_MAX = 100;
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/;

/** 주소 쿼리를 조건으로(형식이 틀린 값은 버림. 기간 길이 등은 backend가 400으로 알려 준다) */
export function parseAuditFilters(search: URLSearchParams): AuditFilters {
  const get = (name: string) => (search.get(name) ?? "").trim();
  const match = (value: string, pattern: RegExp) => (pattern.test(value) ? value : "");
  const action = get("action");
  const groupNames: readonly string[] = AUDIT_ACTION_GROUPS.map((entry) => entry.group);
  const validAction =
    CODE_PATTERN.test(action) ||
    (action.startsWith(GROUP_PREFIX) && groupNames.includes(action.slice(GROUP_PREFIX.length)));
  const pageText = get("page");
  return {
    from: match(get("from"), DATE_PATTERN),
    to: match(get("to"), DATE_PATTERN),
    adminId: match(get("adminId"), ID_PATTERN),
    action: validAction ? action : "",
    targetType: match(get("targetType"), CODE_PATTERN),
    targetId: match(get("targetId"), ID_PATTERN),
    targetKey: get("targetKey").slice(0, KEY_MAX),
    page: /^\d{1,6}$/.test(pageText) ? Math.max(1, Number(pageText)) : 1,
  };
}

function present(filters: AuditFilters): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => key !== "page" && value !== ""),
  ) as Record<string, string>;
}

/** backend 쿼리: 묶음은 코드 목록(쉼표)으로, `page`는 0부터 */
export function auditQuery(
  filters: AuditFilters,
  knownActions?: readonly string[],
): Record<string, string | number> {
  const query: Record<string, string | number> = {
    ...present(filters),
    page: filters.page - 1,
    size: AUDIT_PAGE_SIZE,
  };
  const action = actionQuery(filters.action || null, knownActions);
  if (action) {
    query.action = action;
  } else {
    delete query.action;
  }
  return query;
}

/** 같은 조건의 다른 페이지 주소 */
export function auditHref(filters: AuditFilters, page = 1): string {
  const params = new URLSearchParams(present(filters));
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `${AUDIT_PATH}?${query}` : AUDIT_PATH;
}
