import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { throwApiErrorResponse } from "~/api/errors";
import type { LoginHistoryItem } from "~/api/models";
import { requireUser } from "~/auth/session.server";
import { Pagination } from "~/components/Pagination";
import { useDateFormat } from "~/i18n/format";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/settings.login-history";

const PAGE_SIZE = 20;
const MAX_PAGE = 10_000;
const PATH = "/settings/login-history";

/** 주소의 `?page=`(1부터). 잘못된 값은 첫 페이지 */
function parsePage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1;
}

function pageHref(page: number): string {
  return page <= 1 ? PATH : `${PATH}?page=${page}`;
}

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("settings:loginHistory.title"), t("appName"));
}

/** 최근 로그인 기록(FR-139, quickstart #21): 시각·성공 여부·일부 가린 IP·기기, 최신순 20개씩 */
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const { result, totalCount } = await createApiClient(request)
    .send<LoginHistoryItem[]>("/me/login-history", { query: { page: page - 1, size: PAGE_SIZE } })
    .catch(throwApiErrorResponse);
  return { items: result, totalCount: totalCount ?? result.length, page, pageSize: PAGE_SIZE };
}

export default function SettingsLoginHistory() {
  const { t } = useTranslation();
  const { dateTime } = useDateFormat();
  const { items, totalCount, page, pageSize } = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>{t("settings:loginHistory.title")}</h1>
      {items.length === 0 ? (
        <p>{t("settings:loginHistory.empty")}</p>
      ) : (
        <table className="login-history">
          <caption>{t("settings:loginHistory.caption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("settings:loginHistory.at")}</th>
              <th scope="col">{t("settings:loginHistory.result")}</th>
              <th scope="col">{t("settings:loginHistory.ip")}</th>
              <th scope="col">{t("settings:loginHistory.device")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.at}-${index}`}>
                <td>
                  <time dateTime={item.at}>{dateTime(item.at)}</time>
                </td>
                <td>
                  {item.success
                    ? t("settings:loginHistory.success")
                    : t("settings:loginHistory.failure")}
                </td>
                <td>{item.ipMasked ?? t("settings:loginHistory.unknown")}</td>
                <td>{item.device ?? t("settings:loginHistory.unknown")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pagination page={page} totalCount={totalCount} pageSize={pageSize} hrefFor={pageHref} />
    </main>
  );
}
