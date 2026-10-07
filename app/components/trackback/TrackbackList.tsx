import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { Trackback } from "~/api/models";
import { ReportButton } from "~/components/report/ReportButton";
import { useDateFormat } from "~/i18n/format";

/** `http:`·`https:` 주소만 링크로 그린다(그 밖은 텍스트) */
export function isWebUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export interface TrackbackListProps {
  trackbacks: Trackback[];
  totalCount: number;
  /** 지금 쪽(1부터) */
  page: number;
  pageSize: number;
  /** 다른 쪽 주소(`?tbPage=`) */
  hrefFor: (page: number) => string;
  /** 로그인 회원(주인 제외)에게 각 트랙백 "신고"(005 FR-040) */
  reportable?: boolean;
}

/**
 * 받은 트랙백 목록(005 FR-051). 최신순 한 쪽씩, 다음 쪽은 "더 보기"(`?tbPage=`). 제목·요약·블로그 이름은 모두 텍스트로만
 * 그리고, 제목 링크는 `http(s):` 주소일 때만 `rel="nofollow ugc noopener"`로 건다. 항목 앵커는 `#trackback-{id}`.
 */
export function TrackbackList({
  trackbacks,
  totalCount,
  page,
  pageSize,
  hrefFor,
  reportable = false,
}: TrackbackListProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  if (trackbacks.length === 0) {
    return <p className="trackback-empty">{t("trackback:empty")}</p>;
  }
  const hasMore = page * pageSize < totalCount;
  return (
    <>
      <ul className="trackback-list" aria-label={t("trackback:list")}>
        {trackbacks.map((trackback) => (
          <li key={trackback.id} id={`trackback-${trackback.id}`} className="trackback-item">
            <p className="trackback-title">
              {isWebUrl(trackback.url) ? (
                <a href={trackback.url} rel="nofollow ugc noopener">
                  {trackback.title}
                </a>
              ) : (
                <span>{trackback.title}</span>
              )}
            </p>
            {trackback.excerpt && <p className="trackback-excerpt">{trackback.excerpt}</p>}
            <p className="trackback-meta">
              {trackback.blogName && <span>{trackback.blogName}</span>}{" "}
              <time dateTime={trackback.receivedAt}>{format.dateTime(trackback.receivedAt)}</time>
            </p>
            {reportable && <ReportButton type="TRACKBACK" id={trackback.id} />}
          </li>
        ))}
      </ul>
      {(hasMore || page > 1) && (
        <nav className="trackback-pages" aria-label={t("trackback:pages")}>
          {page > 1 && (
            <Link to={hrefFor(page - 1)} preventScrollReset>
              {t("trackback:newer")}
            </Link>
          )}{" "}
          {hasMore && (
            <Link to={hrefFor(page + 1)} preventScrollReset>
              {t("trackback:more")}
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
