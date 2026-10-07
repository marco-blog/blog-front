import { useTranslation } from "react-i18next";
import { Outlet, useLoaderData, useParams, useSearchParams } from "react-router";

import { createApiClient } from "~/api/client.server";
import { fieldErrorMessage } from "~/api/errorMessage";
import { throwApiErrorResponse } from "~/api/errors";
import type { ReleaseNoteList } from "~/api/models";
import { ReleaseNoteSearch } from "~/components/updates/ReleaseNoteSearch";
import { VersionTree } from "~/components/updates/VersionTree";
import { noteReader } from "~/updates/session.server";
import { compareVersionsDesc, parseVersionParam, searchQueryError } from "~/updates/versionTree";

import type { Route } from "./+types/layout";

/**
 * 릴리스 노트 위키(`/updates/**`, 003 T124, FR-158): 왼쪽에 버전 트리와 검색창, 오른쪽에 화면(Outlet).
 * 버전 목록은 화면 언어 제목으로 읽는다(없으면 en → ko).
 */
export async function loader({ request }: Route.LoaderArgs) {
  const { language } = await noteReader(request);
  const list = await createApiClient(request)
    .get<ReleaseNoteList>("/release-notes", { query: { lang: language } })
    .catch(throwApiErrorResponse);
  return { items: list.items };
}

export default function UpdatesLayout() {
  const { t } = useTranslation();
  const { items } = useLoaderData<typeof loader>();
  const params = useParams();
  const [search] = useSearchParams();
  const q = search.get("q") ?? "";
  const queryError = search.has("q") ? searchQueryError(q) : null;
  const newest = [...items].sort((a, b) => compareVersionsDesc(a.version, b.version))[0];
  const current = params.version
    ? parseVersionParam(params.version)
    : search.has("q")
      ? null
      : (newest?.version ?? null);
  return (
    <div className="updates">
      <aside className="updates-side" aria-label={t("updates:title")}>
        <ReleaseNoteSearch q={q} error={queryError && fieldErrorMessage(t, queryError)} />
        <VersionTree items={items} current={current} />
      </aside>
      <div className="updates-content">
        <Outlet />
      </div>
    </div>
  );
}
