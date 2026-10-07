import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import type { AdminActionData } from "~/admin/actions.server";
import type { Setting } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

import { AdminFormErrors } from "./AdminFormErrors";

/** 작성 속도 한도(005 FR-142). 화면에는 이 순서로 */
export const RATE_LIMIT_KEYS = [
  "ratelimit.post-publish-per-hour",
  "ratelimit.comment-per-minute",
  "ratelimit.guestbook-per-minute",
  "ratelimit.media-upload-per-minute",
  "ratelimit.signup-per-ip-per-hour",
] as const;

/** 반복 스팸 기준(005 FR-144) `{ windowMinutes, maxCount }` */
export const DUPLICATE_KEY = "spam.duplicate-comment";

export const SPAM_SETTING_KEYS = [...RATE_LIMIT_KEYS, DUPLICATE_KEY] as const;
export type SpamSettingKey = (typeof SPAM_SETTING_KEYS)[number];

/** 반복 기준의 두 값과 backend 범위 */
export const DUPLICATE_FIELDS = [
  { name: "windowMinutes", min: 1, max: 1440 },
  { name: "maxCount", min: 2, max: 100 },
] as const;

/** 문구 키에 `.`이 들어가지 않게 설정 키를 바꾼다(`ratelimit.comment-per-minute` → `ratelimit-comment-per-minute`) */
export function settingLabelKey(key: string): string {
  return key.replace(/\./g, "-");
}

type SpamActionData = AdminActionData;

/**
 * 설정 하나의 저장·"기본값으로" 폼(005 `/admin/spam`): 지금 값, 기본값, 바꾼 관리자와 시각.
 * 저장은 `intent=setting`, 되돌리기는 `intent=resetSetting`(같은 화면 action).
 */
export function RateLimitForm({
  setting,
  result,
}: {
  setting: Setting;
  result: SpamActionData | null | undefined;
}) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const submitting = useNavigation().state === "submitting";
  const labelKey = settingLabelKey(setting.key);
  const title = t(`admin:spam.keys.${labelKey}.title`);
  return (
    <section aria-label={title} className="admin-setting">
      <h3>{title}</h3>
      <p className="form-hint">{t(`admin:spam.keys.${labelKey}.hint`)}</p>
      {result?.ok && (
        <p role="status">
          {t(`admin:settings.done.${result.intent === "resetSetting" ? "reset" : "save"}`)}
        </p>
      )}
      <AdminFormErrors error={result && !result.ok ? result : null} />
      <Form method="post" key={`${setting.key}-${JSON.stringify(setting.value)}`}>
        <input type="hidden" name="intent" value="setting" />
        <input type="hidden" name="key" value={setting.key} />
        {setting.key === DUPLICATE_KEY ? (
          <DuplicateInputs setting={setting} />
        ) : (
          <label>
            {t("admin:spam.limit")}{" "}
            <input
              type="number"
              name="value"
              min={1}
              step={1}
              required
              defaultValue={typeof setting.value === "number" ? setting.value : ""}
            />{" "}
            <small>
              {t("admin:settings.default", { value: String(setting.defaultValue ?? "-") })}
            </small>
          </label>
        )}{" "}
        <button type="submit" disabled={submitting}>
          {t("admin:settings.save")}
        </button>
      </Form>
      <p>
        {setting.overridden && setting.updatedBy
          ? t("admin:settings.changedBy", {
              nickname: setting.updatedBy.nickname,
              time: format.dateTime(setting.updatedAt),
            })
          : t("admin:settings.usingDefault")}
      </p>
      {setting.overridden && (
        <Form method="post">
          <input type="hidden" name="intent" value="resetSetting" />
          <input type="hidden" name="key" value={setting.key} />
          <button type="submit" disabled={submitting}>
            {t("admin:settings.reset")}
          </button>
        </Form>
      )}
    </section>
  );
}

function DuplicateInputs({ setting }: { setting: Setting }) {
  const { t } = useTranslation();
  const value = (setting.value ?? {}) as Record<string, unknown>;
  const defaults = (setting.defaultValue ?? {}) as Record<string, unknown>;
  return (
    <>
      {DUPLICATE_FIELDS.map((field) => (
        <label key={field.name}>
          {t(`admin:fields.duplicate.${field.name}`)}{" "}
          <input
            type="number"
            name={`duplicate.${field.name}`}
            min={field.min}
            max={field.max}
            step={1}
            required
            defaultValue={
              typeof value[field.name] === "number" ? (value[field.name] as number) : ""
            }
          />{" "}
          <small>
            {t("admin:settings.default", { value: String(defaults[field.name] ?? "-") })}
          </small>
        </label>
      ))}
    </>
  );
}
