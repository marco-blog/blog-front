import { useTranslation } from "react-i18next";
import { Form, data, useActionData, useLoaderData, useNavigation } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { adminActionError, adminInvalid, type AdminActionData } from "~/admin/actions.server";
import { createApiClient } from "~/api/client.server";
import type { Setting } from "~/api/models";
import { AdminFormErrors } from "~/components/admin/AdminFormErrors";
import { AdminExternalTabs } from "~/components/external/AdminExternalTabs";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-settings";

/** 007 설정 키(backend `SettingKey`)와 화면 문구 키. 화면에는 이 순서로 */
export const EXTERNAL_SETTINGS = [
  { key: "external.fetch-interval", label: "fetchInterval", kind: "duration" },
  { key: "external.auto-classify-min-confidence", label: "minConfidence", kind: "number" },
  { key: "external.score-weight", label: "scoreWeight", kind: "number" },
] as const;
type ExternalSettingKey = (typeof EXTERNAL_SETTINGS)[number]["key"];
const KEYS: readonly string[] = EXTERNAL_SETTINGS.map((item) => item.key);

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:admin.settings.title"), t("appName"));
}

/** 외부 블로그 설정(`/admin/external-blogs/settings`, 007 T071): 수집 주기·자동 분류 신뢰도 기준·인기 점수 가중치, 저장과 "기본값으로" */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const settings = await createApiClient(request)
    .get<Setting[]>("/admin/settings", { query: { prefix: "external." } })
    .catch(throwAdminError);
  return { settings };
}

/** 폼 값 → 저장 값. 수집 주기는 ISO-8601 기간 문자열(대문자), 나머지는 숫자. 범위는 backend가 검사한다. */
export function settingValue(key: ExternalSettingKey, text: string): string | number | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  if (key === "external.fetch-interval") {
    return trimmed.toUpperCase();
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const key = String(form.get("key") ?? "");
  if (!["save", "reset"].includes(intent) || !KEYS.includes(key)) {
    return adminInvalid(intent);
  }
  const api = createApiClient(request);
  const path = `/admin/settings/${encodeURIComponent(key)}`;
  try {
    if (intent === "reset") {
      await api.delete(path);
    } else {
      const value = settingValue(key as ExternalSettingKey, String(form.get("value") ?? ""));
      if (value === null) {
        return adminInvalid(intent, [{ field: "value", code: "INVALID" }], key);
      }
      await api.put(path, { body: { value } });
    }
  } catch (error) {
    return adminActionError(intent, error, { key });
  }
  return data<AdminActionData>({ intent, ok: true, key });
}

export default function AdminExternalSettings() {
  const { t } = useTranslation();
  const { settings } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  return (
    <main className="admin-external-settings">
      <AdminExternalTabs />
      <h1>{t("external:admin.settings.title")}</h1>
      {result && !result.key && <AdminFormErrors error={!result.ok ? result : null} />}
      {EXTERNAL_SETTINGS.map((item) => {
        const setting = byKey.get(item.key);
        return setting ? (
          <SettingSection
            key={item.key}
            item={item}
            setting={setting}
            result={result?.key === item.key ? result : null}
          />
        ) : null;
      })}
    </main>
  );
}

function SettingSection({
  item,
  setting,
  result,
}: {
  item: (typeof EXTERNAL_SETTINGS)[number];
  setting: Setting;
  result: AdminActionData | null;
}) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const submitting = useNavigation().state === "submitting";
  const title = t(`external:admin.settings.${item.label}`);
  const inputId = `setting-${item.label}`;
  const shown = (value: unknown) =>
    typeof value === "number" || typeof value === "string" ? String(value) : "";
  return (
    <section aria-label={title} className="admin-setting">
      <h2>{title}</h2>
      {result?.ok && (
        <p role="status">
          {result.intent === "reset"
            ? t("external:admin.settings.resetDone")
            : t("external:admin.settings.saved")}
        </p>
      )}
      <AdminFormErrors error={result && !result.ok ? result : null} />
      <Form method="post" key={`${item.key}-${shown(setting.value)}`}>
        <input type="hidden" name="intent" value="save" />
        <input type="hidden" name="key" value={item.key} />
        <label htmlFor={inputId}>{title}</label>{" "}
        {item.kind === "duration" ? (
          <input
            id={inputId}
            name="value"
            required
            pattern="[Pp][Tt][0-9HMShms.]+"
            defaultValue={shown(setting.value)}
            aria-describedby={`${inputId}-hint`}
          />
        ) : (
          <input
            id={inputId}
            name="value"
            type="number"
            step="any"
            min={0}
            max={item.key === "external.score-weight" ? 10 : 1}
            required
            defaultValue={shown(setting.value)}
            aria-describedby={`${inputId}-hint`}
          />
        )}{" "}
        <small>
          {t("external:admin.settings.default", { value: shown(setting.defaultValue) || "-" })}
        </small>
        <p id={`${inputId}-hint`} className="field-hint">
          {t(`external:admin.settings.${item.label}Hint`)}
        </p>
        <button type="submit" disabled={submitting}>
          {t("external:common.save")}
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
          <input type="hidden" name="key" value={item.key} />
          <button type="submit" disabled={submitting}>
            {t("external:admin.settings.reset")}
          </button>
        </Form>
      )}
    </section>
  );
}
