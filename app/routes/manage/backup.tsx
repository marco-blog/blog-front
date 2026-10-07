import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Form,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
  useRevalidator,
} from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import { isApiError } from "~/api/errors";
import { toFormError, type FormErrorData } from "~/api/formErrors";
import type { BlogExport } from "~/api/models";
import { FormAlert } from "~/components/form/FormField";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { manageNotFound, requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/backup";

/** 만드는 중인 백업이 있을 때 다시 읽는 주기(contracts/routes.md "30초마다") */
export const BACKUP_REFRESH_MS = 30_000;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:backup.title"), t("appName"));
}

/** 내려받기 주소(front 프록시가 backend로 스트리밍한다) */
export function exportFileHref(handle: string, id: number): string {
  return `/api/v1/blogs/${handle}/exports/${id}/file`;
}

/** 만드는 중(대기·생성 중)인 백업이 있는지 */
export function hasActiveExport(exports: readonly BlogExport[]): boolean {
  return exports.some((item) => item.status === "PENDING" || item.status === "RUNNING");
}

/**
 * 블로그 백업(`/:handle/manage/backup`, SSR, 004 FR-145): "백업 만들기"(블로그별 하루 한 번)와 최근 백업 10건(상태·크기·만료).
 * 완료(READY)된 백업만 내려받기 링크를 준다. 만드는 중인 백업이 있으면 30초마다 목록을 다시 읽는다(JS가 있을 때).
 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const exports = await createApiClient(request)
    .get<BlogExport[]>(`/blogs/${handle}/exports`)
    .catch(throwManageError);
  return { handle, exports };
}

type BackupActionData = { ok: true } | (FormErrorData & { ok: false });

/** `intent=create` → `POST /blogs/{handle}/exports`. 하루 한 번이 넘으면 409 `EXPORT_LIMIT_EXCEEDED`를 문구로 보여준다. */
export async function action({ request, params }: Route.ActionArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const form = await request.formData();
  if (form.get("intent") !== "create") {
    return data<BackupActionData>(
      { ok: false, resultCode: "VALIDATION_FAILED", field: null, fieldErrors: [] },
      { status: 400 },
    );
  }
  try {
    await createApiClient(request).post<BlogExport>(`/blogs/${handle}/exports`);
    return data<BackupActionData>({ ok: true });
  } catch (error) {
    if (isApiError(error) && error.status === 403) {
      throw manageNotFound();
    }
    const { data: formError, status } = toFormError(error);
    return data<BackupActionData>({ ...formError, ok: false }, { status });
  }
}

/** 파일 크기를 화면 언어의 단위 표기로(예: 1.5 MB) */
export function formatFileSize(bytes: number | null, language: string): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

export default function ManageBackup() {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const { handle, exports } = useLoaderData<typeof loader>();
  const result = useActionData<BackupActionData>();
  const submitting = useNavigation().state === "submitting";
  const revalidator = useRevalidator();
  const active = hasActiveExport(exports);

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (revalidator.state === "idle") {
        void revalidator.revalidate();
      }
    }, BACKUP_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, revalidator]);

  return (
    <main className="manage-backup">
      <h1>{t("manage:backup.title")}</h1>
      <p>{t("manage:backup.description")}</p>
      <p>{t("manage:backup.limit")}</p>
      {result?.ok && <p role="status">{t("manage:backup.requested")}</p>}
      <FormAlert message={result && !result.ok ? errorMessage(t, result) : null} />
      <Form method="post">
        <input type="hidden" name="intent" value="create" />
        <button type="submit" disabled={submitting || active}>
          {t("manage:backup.create")}
        </button>
      </Form>
      <h2>{t("manage:backup.recent")}</h2>
      {exports.length === 0 ? (
        <p>{t("manage:backup.empty")}</p>
      ) : (
        <ul className="backup-list" aria-label={t("manage:backup.recent")}>
          {exports.map((item) => (
            <li key={item.id}>
              <strong>{t(`manage:backup.status.${item.status}`)}</strong> ·{" "}
              <span>{t("manage:backup.createdAt", { time: format.dateTime(item.createdAt) })}</span>
              {item.status === "READY" && (
                <>
                  {" "}
                  · <span>{formatFileSize(item.fileSize, i18n.language)}</span> ·{" "}
                  <span>
                    {t("manage:backup.expiresAt", { time: format.dateTime(item.expiresAt) })}
                  </span>{" "}
                  <a href={exportFileHref(handle, item.id)} download>
                    {t("manage:backup.download")}
                  </a>
                </>
              )}
              {item.status === "FAILED" && (
                <>
                  {" "}
                  · <span>{t("manage:backup.failed")}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {active && <p aria-live="polite">{t("manage:backup.working")}</p>}
    </main>
  );
}
