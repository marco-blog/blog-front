import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { PostSummary } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

export interface PostListProps {
  handle: string;
  posts: PostSummary[];
}

/** 블로그 글 목록(최신순). 빈 목록이면 안내 문구 */
export function PostList({ handle, posts }: PostListProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  if (posts.length === 0) {
    return <p className="post-list-empty">{t("post:list.empty")}</p>;
  }
  return (
    <ul className="post-list" aria-label={t("post:list.label")}>
      {posts.map((post) => (
        <li key={post.id}>
          <article>
            <h2>
              <Link to={`/${handle}/${post.id}`}>{post.title}</Link>
            </h2>
            {post.thumbnailUrl && (
              <img src={post.thumbnailUrl} alt="" loading="lazy" className="post-thumbnail" />
            )}
            {post.summary && <p>{post.summary}</p>}
            <p className="post-meta">
              {post.publishedAt && (
                <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
              )}{" "}
              <span>{t("post:views", { views: post.viewCount })}</span>
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}
