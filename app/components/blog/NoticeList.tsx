import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { PostSummary } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

export interface NoticeListProps {
  handle: string;
  notices: PostSummary[];
  /** 전체 공지 수. 보여준 수보다 많으면 "공지 더 보기" */
  totalCount: number;
}

/** 블로그 홈 글 목록 위 공지(최대 5개, 004 FR-059). 공지가 없으면 그리지 않는다. */
export function NoticeList({ handle, notices, totalCount }: NoticeListProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  if (notices.length === 0) {
    return null;
  }
  return (
    <section className="notice-list" aria-labelledby="blog-notices">
      <h2 id="blog-notices">{t("blog:notice.title")}</h2>
      <ul>
        {notices.map((post) => (
          <li key={post.id}>
            <span className="badge badge-notice">{t("blog:notice.badge")}</span>{" "}
            <Link to={`/${handle}/${post.id}`}>{post.title}</Link>{" "}
            {post.publishedAt && (
              <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
            )}
          </li>
        ))}
      </ul>
      {totalCount > notices.length && (
        <p>
          <Link to={`/${handle}/notice`}>{t("blog:notice.more")}</Link>
        </p>
      )}
    </section>
  );
}
