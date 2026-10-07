import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { ArchiveMonth } from "~/api/models";
import { archiveHref, formatYearMonth } from "~/blog/archive";
import { useDateFormat } from "~/i18n/format";

/** 월별 보관함(최근 달부터, 004 FR-061). 누르면 그 달의 글 목록 */
export function ArchiveList({ handle, months }: { handle: string; months: ArchiveMonth[] }) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  if (months.length === 0) {
    return <p>{t("blog:archive.empty")}</p>;
  }
  return (
    <ul className="archive-list">
      {months.map((month) => (
        <li key={`${month.year}-${month.month}`}>
          <Link to={archiveHref(handle, month)}>
            {formatYearMonth(month, i18n.language)} ({format.number(month.postCount)})
          </Link>
        </li>
      ))}
    </ul>
  );
}
