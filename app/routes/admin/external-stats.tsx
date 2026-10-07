import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";

import { requireAdmin, throwAdminError } from "~/admin/access.server";
import { createApiClient } from "~/api/client.server";
import type { ClassificationStats as Stats, TopicNode } from "~/api/models";
import { AdminExternalTabs } from "~/components/external/AdminExternalTabs";
import { ClassificationStats } from "~/components/external/ClassificationStats";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/external-stats";

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("external:admin.stats.title"), t("appName"));
}

/** 분류 현황(`/admin/external-blogs/stats`, 007 T071, FR-122). backend가 5분 캐시한 값을 그대로 보인다. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const api = createApiClient(request);
  const [stats, topics] = await Promise.all([
    api.get<Stats>("/admin/classification-stats"),
    api.get<TopicNode[]>("/topics").catch(() => [] as TopicNode[]),
  ]).catch(throwAdminError);
  return { stats, topics };
}

export default function AdminExternalStats() {
  const { t } = useTranslation();
  const { stats, topics } = useLoaderData<typeof loader>();
  return (
    <main className="admin-external-stats">
      <AdminExternalTabs />
      <h1>{t("external:admin.stats.title")}</h1>
      <ClassificationStats stats={stats} topics={topics} />
    </main>
  );
}
