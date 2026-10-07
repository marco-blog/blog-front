import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import type { TopicMappingRule, TopicNode } from "~/api/models";

import { TopicSelect } from "./TopicSelect";

export const RULE_KEYWORD_MAX = 100;
export const RULE_PRIORITY_MIN = -1000;
export const RULE_PRIORITY_MAX = 1000;

export interface RuleFormProps {
  topics: TopicNode[];
  /** 고칠 규칙(없으면 새 규칙) */
  rule?: TopicMappingRule;
  /** 입력란 오류 문구(`keyword`·`topicId`·`priority`) */
  fields?: Record<string, string>;
  /** 폼을 보낼 주소(검색어·페이지 유지) */
  action: string;
}

/**
 * 매핑 규칙 추가·수정 폼(007 T071): 키워드(1~100자, backend가 정규화), 소분류 주제, 우선순위(-1000~1000). 새 규칙은 `intent=create`,
 * 고치기는 `intent=update`와 `id`. JS 없이 동작한다.
 */
export function RuleForm({ topics, rule, fields = {}, action }: RuleFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const editing = rule !== undefined;
  return (
    <Form
      method="post"
      action={action}
      className="rule-form"
      aria-label={
        editing
          ? t("external:admin.rules.editFor", { keyword: rule.keyword })
          : t("external:admin.rules.add")
      }
    >
      <input type="hidden" name="intent" value={editing ? "update" : "create"} />
      {editing && <input type="hidden" name="id" value={rule.id} />}
      <label htmlFor={`${id}-keyword`}>{t("external:admin.rules.keyword")}</label>
      <input
        id={`${id}-keyword`}
        name="keyword"
        required
        maxLength={RULE_KEYWORD_MAX}
        defaultValue={rule?.keyword ?? ""}
        aria-invalid={fields.keyword ? true : undefined}
      />
      {fields.keyword && (
        <p className="field-error" role="alert">
          {fields.keyword}
        </p>
      )}
      <TopicSelect
        topics={topics}
        name="topicId"
        defaultValue={rule?.topicId ?? null}
        label={t("external:common.topic")}
        error={fields.topicId ?? null}
      />
      <label htmlFor={`${id}-priority`}>{t("external:admin.rules.priority")}</label>
      <input
        id={`${id}-priority`}
        name="priority"
        type="number"
        step={1}
        min={RULE_PRIORITY_MIN}
        max={RULE_PRIORITY_MAX}
        defaultValue={rule?.priority ?? 0}
        aria-invalid={fields.priority ? true : undefined}
      />
      <p className="field-hint">{t("external:admin.rules.priorityHint")}</p>
      {fields.priority && (
        <p className="field-error" role="alert">
          {fields.priority}
        </p>
      )}
      <button type="submit">
        {editing ? t("external:admin.rules.update") : t("external:admin.rules.add")}
      </button>
    </Form>
  );
}
