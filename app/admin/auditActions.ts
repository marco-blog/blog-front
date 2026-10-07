/**
 * 작업 기록의 작업 종류(006 FR-106, backend `AuditActions.ALL`)를 화면 필터의 묶음으로 나눈 것.
 * 이름은 `audit:actions.{CODE}`, 묶음 이름은 `audit:groups.{group}`. backend에 새 코드가 생기면 여기와 `audit` namespace에
 * 더한다(E2E admin-us3가 `GET /admin/audit-logs/actions`와 비교). 여기 없는 코드도 필터의 "기타"가 아니라 코드 그대로 보인다.
 */
export const AUDIT_ACTION_GROUPS = [
  {
    group: "topic",
    actions: [
      "TOPIC_CREATE",
      "TOPIC_UPDATE",
      "TOPIC_REORDER",
      "TOPIC_HIDE",
      "TOPIC_UNHIDE",
      "TOPIC_PIN",
      "TOPIC_UNPIN",
    ],
  },
  {
    group: "portal",
    actions: [
      "CURATION_CREATE",
      "CURATION_UPDATE",
      "CURATION_DELETE",
      "PORTAL_EXCLUDE",
      "PORTAL_UNEXCLUDE",
    ],
  },
  { group: "user", actions: ["USER_SUSPEND", "USER_UNSUSPEND", "USER_BLOG_LIMIT_CHANGE"] },
  {
    group: "moderation",
    actions: [
      "REPORT_ACTION",
      "REPORT_DISMISS",
      "REPORT_TARGET_ASSIGN",
      "CONTENT_HIDE",
      "CONTENT_UNHIDE",
      "BANNED_WORD_CREATE",
      "BANNED_WORD_UPDATE",
      "BANNED_WORD_DELETE",
    ],
  },
  { group: "setting", actions: ["SETTING_CHANGE"] },
  {
    group: "releaseNote",
    actions: [
      "RELEASE_NOTE_CREATE",
      "RELEASE_NOTE_UPDATE",
      "RELEASE_NOTE_PUBLISH",
      "RELEASE_NOTE_UNPUBLISH",
      "RELEASE_NOTE_DELETE",
    ],
  },
  { group: "role", actions: ["ROLE_GRANT", "ROLE_REVOKE"] },
] as const;

export type AuditActionGroup = (typeof AUDIT_ACTION_GROUPS)[number]["group"];

/** 알려진 작업 종류 전체(묶음 순서) */
export const AUDIT_ACTIONS: readonly string[] = AUDIT_ACTION_GROUPS.flatMap((entry) => [
  ...entry.actions,
]);

/** 알려진 대상 종류(backend `AuditActions.TARGETS`). 이름은 `audit:targets.{TYPE}` */
export const AUDIT_TARGETS: readonly string[] = [
  "USER",
  "TOPIC",
  "CURATION",
  "POST",
  "SETTING",
  "RELEASE_NOTE",
  "REPORT",
  "COMMENT",
  "GUESTBOOK",
  "TRACKBACK",
  "BANNED_WORD",
];

/** 묶음 하나를 고르면 그 묶음의 작업 전부(쉼표로 이어 `action` 쿼리로). 값 앞에 붙는 표시 */
export const GROUP_PREFIX = "group:";

/**
 * 필터 선택 값을 backend `action` 쿼리로: `group:topic` → 그 묶음 코드를 쉼표로, 코드 하나는 그대로, 모르는 값은 버림.
 * backend가 준 목록(`known`)에 있는 코드만 보낸다.
 */
export function actionQuery(value: string | null, known: readonly string[] = AUDIT_ACTIONS) {
  if (!value) {
    return undefined;
  }
  if (value.startsWith(GROUP_PREFIX)) {
    const group = AUDIT_ACTION_GROUPS.find(
      (entry) => entry.group === value.slice(GROUP_PREFIX.length),
    );
    const codes = group ? group.actions.filter((code) => known.includes(code)) : [];
    return codes.length > 0 ? codes.join(",") : undefined;
  }
  return known.includes(value) ? value : undefined;
}

/** backend가 알려준 코드 중 front 묶음에 없는 것(필터 맨 끝에 코드 그대로) */
export function ungroupedActions(known: readonly string[]): string[] {
  return known.filter((code) => !AUDIT_ACTIONS.includes(code));
}
