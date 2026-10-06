import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { hoursToIsoDuration, isoDurationToHours } from "~/admin/duration";
import { createApiClient } from "~/api/client.server";
import type { ScoreWeights, Setting } from "~/api/models";
import type { ApiFieldError } from "~/api/types";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/settings";

/** 003이 다루는 설정 키(backend `SettingKey`). 화면에는 이 순서로 */
export const PORTAL_SETTING_KEYS = [
  "portal.score-weights",
  "portal.new-member-delay",
  "portal.min-content-length",
  "portal.topic-auto-hide-threshold",
] as const;
type SettingKey = (typeof PORTAL_SETTING_KEYS)[number];

/** 인기 점수 가중치 6개(입력 순서) */
export const WEIGHT_FIELDS: readonly (keyof ScoreWeights)[] = [
  "view",
  "readComplete",
  "like",
  "comment",
  "halfLifeHours",
  "reportPenalty",
];

const INTENTS = ["save", "reset"] as const;
type Intent = (typeof INTENTS)[number];
type SettingsActionData = AdminActionData;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:settings.title"), t("appName"));
}

/** 포털 설정(`/admin/portal/settings`, 003 T103, FR-094): 지금 값·기본값·바뀐 사람, 저장과 "기본값으로" */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const settings = await createApiClient(request)
    .get<Setting[]>("/admin/settings", { query: { prefix: "portal." } })
    .catch(throwAdminError);
  return { settings };
}

function numberField(form: FormData, name: string, field: string, errors: ApiFieldError[]) {
  const text = String(form.get(name) ?? "").trim();
  if (!text) {
    errors.push({ field, code: "REQUIRED" });
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value)) {
    errors.push({ field, code: "INVALID" });
    return null;
  }
  return value;
}

/** 폼 값 → 키별 저장 값. 숫자가 아니면 입력 오류 */
function valueFrom(key: SettingKey, form: FormData): { value: unknown; errors: ApiFieldError[] } {
  const errors: ApiFieldError[] = [];
  if (key === "portal.score-weights") {
    const value = Object.fromEntries(
      WEIGHT_FIELDS.map((field) => [
        field,
        numberField(form, `weights.${field}`, `weights.${field}`, errors),
      ]),
    );
    return { value, errors };
  }
  const number = numberField(form, "value", "value", errors);
  if (key === "portal.new-member-delay") {
    const duration = number === null ? null : hoursToIsoDuration(number);
    if (number !== null && duration === null) {
      errors.push({ field: "value", code: "INVALID" });
    }
    return { value: duration, errors };
  }
  return { value: number, errors };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intentText = String(form.get("intent") ?? "");
  const key = String(form.get("key") ?? "");
  if (
    !(INTENTS as readonly string[]).includes(intentText) ||
    !(PORTAL_SETTING_KEYS as readonly string[]).includes(key)
  ) {
    return adminInvalid(intentText);
  }
  const intent = intentText as Intent;
  const api = createApiClient(request);
  const path = `/admin/settings/${encodeURIComponent(key)}`;
  try {
    if (intent === "reset") {
      await api.delete(path);
    } else {
      const { value, errors } = valueFrom(key as SettingKey, form);
      if (errors.length > 0) {
        return adminInvalid(intent, errors, key);
      }
      await api.put(path, { body: { value } });
    }
  } catch (error) {
    // backend 입력란 이름(`value.like`)을 화면 입력란 이름(`weights.like`)으로
    return adminActionError(intent, error, {
      key,
      renameField: (field) => field.replace(/^value\./, "weights."),
    });
  }
  return data<SettingsActionData>({ intent, ok: true, key });
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const { settings } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));

  return (
    <main className="admin-settings">
      <h1>{t("admin:settings.title")}</h1>
      <p>{t("admin:settings.hint")}</p>
      {result && !result.key && <AdminFormErrors error={!result.ok ? result : null} />}
      {PORTAL_SETTING_KEYS.map((key) => {
        const setting = byKey.get(key);
        if (!setting) {
          return null;
        }
        const own = result?.key === key ? result : null;
        return <SettingSection key={key} setting={setting} result={own} />;
      })}
    </main>
  );
}

function SettingSection({
  setting,
  result,
}: {
  setting: Setting;
  result: SettingsActionData | null;
}) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const submitting = useNavigation().state === "submitting";
  const key = setting.key as SettingKey;
  const title = t(`admin:settings.keys.${key}.title`);
  return (
    <section aria-label={title} className="admin-setting">
      <h2>{title}</h2>
      <p className="form-hint">{t(`admin:settings.keys.${key}.hint`)}</p>
      {result?.ok && (
        <p role="status">
          {t(`admin:settings.done.${result.intent === "reset" ? "reset" : "save"}`)}
        </p>
      )}
      <AdminFormErrors error={result && !result.ok ? result : null} />
      <Form method="post" key={`${key}-${JSON.stringify(setting.value)}`}>
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="key" value={key} />
        <SettingInputs setting={setting} />
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
          <input type="hidden" name="intent" value="reset" />
          <input type="hidden" name="key" value={key} />
          <button type="submit" disabled={submitting}>
            {t("admin:settings.reset")}
          </button>
        </Form>
      )}
    </section>
  );
}

function SettingInputs({ setting }: { setting: Setting }) {
  const { t } = useTranslation();
  const key = setting.key as SettingKey;
  if (key === "portal.score-weights") {
    const value = (setting.value ?? {}) as Partial<ScoreWeights>;
    const defaults = (setting.defaultValue ?? {}) as Partial<ScoreWeights>;
    return (
      <>
        {WEIGHT_FIELDS.map((field) => (
          <label key={field}>
            {t(`admin:fields.weights.${field}`)}{" "}
            <input
              type="number"
              name={`weights.${field}`}
              step="any"
              required
              defaultValue={value[field] ?? ""}
            />{" "}
            <small>{t("admin:settings.default", { value: defaults[field] ?? "-" })}</small>
          </label>
        ))}
      </>
    );
  }
  if (key === "portal.new-member-delay") {
    return (
      <label>
        {t("admin:settings.keys.portal.new-member-delay.input")}{" "}
        <input
          type="number"
          name="value"
          min={0}
          step="any"
          required
          defaultValue={isoDurationToHours(setting.value) ?? ""}
        />{" "}
        <small>
          {t("admin:settings.default", { value: isoDurationToHours(setting.defaultValue) ?? "-" })}
        </small>
      </label>
    );
  }
  return (
    <label>
      {t(`admin:settings.keys.${key}.input`)}{" "}
      <input
        type="number"
        name="value"
        min={0}
        step={1}
        required
        defaultValue={typeof setting.value === "number" ? setting.value : ""}
      />{" "}
      <small>{t("admin:settings.default", { value: String(setting.defaultValue ?? "-") })}</small>
    </label>
  );
}
