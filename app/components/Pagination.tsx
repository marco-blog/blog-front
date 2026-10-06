import { useTranslation } from "react-i18next";
import { Link } from "react-router";

export interface PaginationProps {
  /** 지금 페이지(1부터) */
  page: number;
  totalCount: number;
  pageSize: number;
  /** 페이지 번호 → 주소 */
  hrefFor: (page: number) => string;
  /** 한 번에 보여줄 번호 수 */
  window?: number;
}

/** 페이지 이동(이전·번호·다음). JS 없이도 링크로 동작한다. 한 페이지뿐이면 그리지 않는다. */
export function Pagination({ page, totalCount, pageSize, hrefFor, window = 10 }: PaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) {
    return null;
  }
  const first = Math.floor((Math.min(page, totalPages) - 1) / window) * window + 1;
  const last = Math.min(totalPages, first + window - 1);
  const pages = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  return (
    <nav aria-label={t("pagination.label")} className="pagination">
      {page > 1 && (
        <Link to={hrefFor(page - 1)} rel="prev">
          {t("pagination.previous")}
        </Link>
      )}
      {pages.map((number) =>
        number === page ? (
          <span key={number} aria-current="page">
            {number}
          </span>
        ) : (
          <Link key={number} to={hrefFor(number)}>
            {number}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link to={hrefFor(page + 1)} rel="next">
          {t("pagination.next")}
        </Link>
      )}
    </nav>
  );
}
