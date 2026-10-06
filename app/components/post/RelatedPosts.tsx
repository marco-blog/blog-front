import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { PostSummary } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

export interface RelatedPostsProps {
  /** 글이 속한 블로그 주소. 관련 글은 같은 블로그의 글이다. */
  handle: string;
  posts: PostSummary[];
}

/** 관련 글(002 FR-068): 같은 블로그에서 태그·카테고리가 겹치는 글 최대 5편. 없으면 영역을 그리지 않는다. */
export function RelatedPosts({ handle, posts }: RelatedPostsProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const headingId = useId();
  if (posts.length === 0) {
    return null;
  }
  return (
    <section className="related-posts" aria-labelledby={headingId}>
      <h2 id={headingId}>{t("discovery:related.title")}</h2>
      <ul>
        {posts.map((post) => (
          <li key={post.id}>
            <Link to={`/${handle}/${post.id}`}>{post.title}</Link>
            {post.publishedAt && (
              <>
                {" "}
                <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
