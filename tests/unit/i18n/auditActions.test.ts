import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTIONS,
  AUDIT_TARGETS,
  actionQuery,
  ungroupedActions,
} from "~/admin/auditActions";
import { auditHref, auditQuery, parseAuditFilters } from "~/admin/auditFilters";
import { SUPPORTED_LANGUAGES } from "~/i18n/config";
import { allResources } from "~/i18n/resources.server";

/** backend `AuditActions.ALL`(006 data-model, 005 값 포함). E2E admin-us3가 실제 `GET /admin/audit-logs/actions`와 비교한다. */
const BACKEND_ACTIONS = [
  "TOPIC_CREATE",
  "TOPIC_UPDATE",
  "TOPIC_REORDER",
  "TOPIC_HIDE",
  "TOPIC_UNHIDE",
  "TOPIC_PIN",
  "TOPIC_UNPIN",
  "CURATION_CREATE",
  "CURATION_UPDATE",
  "CURATION_DELETE",
  "PORTAL_EXCLUDE",
  "PORTAL_UNEXCLUDE",
  "SETTING_CHANGE",
  "RELEASE_NOTE_CREATE",
  "RELEASE_NOTE_UPDATE",
  "RELEASE_NOTE_PUBLISH",
  "RELEASE_NOTE_UNPUBLISH",
  "RELEASE_NOTE_DELETE",
  "USER_SUSPEND",
  "USER_UNSUSPEND",
  "REPORT_ACTION",
  "REPORT_DISMISS",
  "CONTENT_HIDE",
  "CONTENT_UNHIDE",
  "BANNED_WORD_CREATE",
  "BANNED_WORD_UPDATE",
  "BANNED_WORD_DELETE",
  "USER_BLOG_LIMIT_CHANGE",
  "ROLE_GRANT",
  "ROLE_REVOKE",
  "EXTERNAL_BLOG_CREATE",
  "EXTERNAL_BLOG_APPROVE",
  "EXTERNAL_BLOG_REJECT",
  "EXTERNAL_BLOG_UPDATE",
  "EXTERNAL_BLOG_PAUSE",
  "EXTERNAL_BLOG_RESUME",
  "EXTERNAL_BLOG_BLOCK",
  "EXTERNAL_POST_REMOVE",
  "TOPIC_MAPPING_RULE_CREATE",
  "TOPIC_MAPPING_RULE_UPDATE",
  "TOPIC_MAPPING_RULE_DELETE",
  "CLASSIFICATION_CONFIRM",
];

/** 작업 종류 이름(006 T047) */
describe("auditActions", () => {
  it("backend 목록과 같은 코드 집합, 묶음마다 하나 이상, 중복 없음", () => {
    expect([...AUDIT_ACTIONS].sort()).toEqual([...BACKEND_ACTIONS].sort());
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    for (const group of AUDIT_ACTION_GROUPS) {
      expect(group.actions.length).toBeGreaterThan(0);
    }
  });

  it.each(SUPPORTED_LANGUAGES)("%s: 모든 코드·대상·묶음에 문구", (language) => {
    const audit = allResources[language].audit as {
      actions: Record<string, string>;
      targets: Record<string, string>;
      groups: Record<string, string>;
    };
    for (const code of AUDIT_ACTIONS) {
      expect(audit.actions[code], code).toBeTruthy();
    }
    for (const type of AUDIT_TARGETS) {
      expect(audit.targets[type], type).toBeTruthy();
    }
    for (const group of AUDIT_ACTION_GROUPS) {
      expect(audit.groups[group.group], group.group).toBeTruthy();
    }
  });

  it("필터 값 → backend action 쿼리", () => {
    expect(actionQuery("group:role")).toBe("ROLE_GRANT,ROLE_REVOKE");
    expect(actionQuery("group:role", ["ROLE_GRANT"])).toBe("ROLE_GRANT");
    expect(actionQuery("group:role", [])).toBeUndefined();
    expect(actionQuery("group:nothing")).toBeUndefined();
    expect(actionQuery("TOPIC_HIDE")).toBe("TOPIC_HIDE");
    expect(actionQuery("UNKNOWN_CODE")).toBeUndefined();
    expect(actionQuery(null)).toBeUndefined();
    expect(ungroupedActions(["TOPIC_HIDE", "FUTURE_ACTION"])).toEqual(["FUTURE_ACTION"]);
  });

  it("작업 기록 조건 해석·쿼리·주소", () => {
    const filters = parseAuditFilters(
      new URLSearchParams(
        "from=2026-10-01&to=bad&adminId=3&action=group:topic&targetType=USER&targetId=12&targetKey=%20k%20&page=2",
      ),
    );
    expect(filters).toEqual({
      from: "2026-10-01",
      to: "",
      adminId: "3",
      action: "group:topic",
      targetType: "USER",
      targetId: "12",
      targetKey: "k",
      page: 2,
    });
    expect(auditQuery(filters, BACKEND_ACTIONS)).toEqual({
      from: "2026-10-01",
      adminId: "3",
      action:
        "TOPIC_CREATE,TOPIC_UPDATE,TOPIC_REORDER,TOPIC_HIDE,TOPIC_UNHIDE,TOPIC_PIN,TOPIC_UNPIN",
      targetType: "USER",
      targetId: "12",
      targetKey: "k",
      page: 1,
      size: 20,
    });
    expect(auditQuery(parseAuditFilters(new URLSearchParams("action=group:zzz")))).toEqual({
      page: 0,
      size: 20,
    });
    expect(
      parseAuditFilters(new URLSearchParams("action=lower&targetType=user&page=x")),
    ).toMatchObject({ action: "", targetType: "", page: 1 });
    expect(auditHref(filters, 3)).toBe(
      "/admin/audit-log?from=2026-10-01&adminId=3&action=group%3Atopic&targetType=USER&targetId=12&targetKey=k&page=3",
    );
    expect(auditHref(parseAuditFilters(new URLSearchParams()))).toBe("/admin/audit-log");
  });
});
