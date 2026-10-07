import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { ReleaseNoteSummary } from "~/api/models";
import { versionHref } from "~/updates/versionTree";

/** 포털 메인 맨 위 릴리스 노트 카드(003 FR-164): 처음 게시 후 일정 기간(backend `portalCard`)만 보인다. */
export function ReleaseNoteCard({ note }: { note: ReleaseNoteSummary }) {
  const { t } = useTranslation();
  return (
    <aside className="portal-release-note" aria-label={t("updates:title")}>
      <p>
        {t("portal:home.releaseNote", { title: note.title })}{" "}
        <Link to={versionHref(note.version)}>{t("portal:home.releaseNoteLink")}</Link>
      </p>
    </aside>
  );
}
