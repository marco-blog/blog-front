import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { ReleaseNoteSummary } from "~/api/models";
import { groupVersions, versionHref } from "~/updates/versionTree";

/** 왼쪽 버전 트리(003 FR-158): `major.minor` 묶음, 새 버전 위, 지금 버전 표시 */
export function VersionTree({
  items,
  current,
}: {
  items: readonly ReleaseNoteSummary[];
  current: string | null;
}) {
  const { t } = useTranslation();
  if (items.length === 0) {
    return null;
  }
  return (
    <nav aria-label={t("updates:tree.label")} className="version-tree">
      <ul>
        {groupVersions(items).map((group) => (
          <li key={group.key}>
            <span className="version-group">{t("updates:tree.group", { version: group.key })}</span>
            <ul>
              {group.items.map((item) => (
                <li key={item.version}>
                  <Link
                    to={versionHref(item.version)}
                    aria-current={item.version === current ? "page" : undefined}
                  >
                    v{item.version} {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
