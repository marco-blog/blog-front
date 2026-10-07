import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export type TopicSort = "latest" | "popular";

/** 정렬 전환 주소: 최신순은 기본이라 붙이지 않고, 바꾸면 첫 페이지로 간다. */
export function sortHref(path: string, sort: TopicSort): string {
  return sort === "popular" ? `${path}?sort=popular` : path;
}

/** 주제 페이지 정렬(003 FR-078): 최신순·인기순 링크(JS 없이 동작), 지금 정렬은 `aria-current`. */
export function SortToggle({ path, sort }: { path: string; sort: TopicSort }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("portal:topic.sortLabel")} className="portal-sort">
      {(["latest", "popular"] as const).map((value) => (
        <Link
          key={value}
          to={sortHref(path, value)}
          aria-current={value === sort ? "page" : undefined}
        >
          {t(`portal:topic.${value}`)}
        </Link>
      ))}
    </nav>
  );
}
