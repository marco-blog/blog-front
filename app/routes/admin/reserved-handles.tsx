import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/reserved-handles";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("admin:reservedHandles.title"), t("appName"));
}

/** 예약어(`/admin/reserved-handles`, 006 FR-102, T038): backend `ReservedHandles.NAMES`를 읽기 전용으로 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const names = await createApiClient(request)
    .get<string[]>("/admin/reserved-handles")
    .catch(throwAdminError);
  return { names };
}

export default function AdminReservedHandles() {
  const { t } = useTranslation();
  const { names } = useLoaderData<typeof loader>();
  return (
    <main className="admin-reserved-handles">
      <h1>{t("admin:reservedHandles.title")}</h1>
      <p className="form-hint">{t("admin:reservedHandles.hint")}</p>
      <p>{t("admin:reservedHandles.count", { count: names.length })}</p>
      <ul className="reserved-handle-list" aria-label={t("admin:reservedHandles.list")}>
        {names.map((name) => (
          <li key={name}>
            <code>{name}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}
