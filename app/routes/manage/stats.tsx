import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import type { VisitStats } from "~/api/models";
import { DailyBarChart } from "~/components/charts/DailyBarChart";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { requireOwnedBlog, throwManageError } from "~/manage/access.server";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/stats";

/** 통계 기간(일, backend 최대 30) */
export const STATS_DAYS = 30;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("manage:stats.title"), t("appName"));
}

/** 통계(`/:handle/manage/stats`, SSR, 004 FR-067): 오늘·어제·전체 방문자, 최근 30일 일별 방문자, 조회수 상위 글 */
export async function loader({ request, params }: Route.LoaderArgs) {
  const { handle } = await requireOwnedBlog(request, params.handle);
  const stats = await createApiClient(request)
    .get<VisitStats>(`/blogs/${handle}/manage/stats`, { query: { days: STATS_DAYS } })
    .catch(throwManageError);
  return { handle, stats };
}

export default function ManageStats() {
  const { t } = useTranslation();
  const format = useDateFormat();
  const { handle, stats } = useLoaderData<typeof loader>();
  return (
    <main className="manage-stats-page">
      <h1>{t("manage:stats.title")}</h1>
      <dl className="manage-stats">
        <div>
          <dt>{t("blog:visitors.today")}</dt>
          <dd>{format.number(stats.visitors.today)}</dd>
        </div>
        <div>
          <dt>{t("blog:visitors.yesterday")}</dt>
          <dd>{format.number(stats.visitors.yesterday)}</dd>
        </div>
        <div>
          <dt>{t("blog:visitors.total")}</dt>
          <dd>{format.number(stats.visitors.total)}</dd>
        </div>
      </dl>
      <p className="form-hint">{t("manage:stats.timeZoneNote")}</p>
      <DailyBarChart
        className="visitor-chart"
        caption={t("manage:stats.dailyCaption", { count: stats.daily.length })}
        dateLabel={t("manage:stats.date")}
        series={[
          { key: "visitors", label: t("manage:stats.visitors"), barClassName: "visitor-bar" },
        ]}
        rows={stats.daily}
      />

      <section aria-labelledby="stats-top-posts">
        <h2 id="stats-top-posts">{t("manage:stats.topPosts")}</h2>
        {stats.topPosts.length === 0 ? (
          <p>{t("manage:stats.noPosts")}</p>
        ) : (
          <ol>
            {stats.topPosts.map((post) => (
              <li key={post.id}>
                <Link to={`/${handle}/${post.id}`}>{post.title || t("manage:posts.untitled")}</Link>{" "}
                <span>{t("post:views", { views: post.viewCount })}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
