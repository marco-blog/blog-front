import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { PostSummary } from "~/api/models";
import { categoryHref } from "~/components/blog/CategoryTree";
import { useDateFormat } from "~/i18n/format";
import { thumbnailImage } from "~/media/thumbnail";

/** 블로그 안 태그별 글 목록 주소 */
export function blogTagHref(handle: string, tag: string): string {
  return `/${handle}/tags/${encodeURIComponent(tag)}`;
}

/** 서비스 전체 태그별 글 목록 주소 */
export function tagHref(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}`;
}

export interface PostListProps {
  /** 글마다 blogHandle이 있으면(서비스 전체 태그 목록) 그 값을 쓴다. */
  handle?: string;
  posts: (PostSummary & { blogHandle?: string })[];
  /** 태그 링크: 블로그 안(기본) 또는 서비스 전체 */
  tagScope?: "blog" | "global";
  /** 빈 목록 문구 */
  emptyText?: string;
}

/** 글 목록(최신순). 카테고리·태그는 각 목록으로 가는 링크. 빈 목록이면 안내 문구 */
export function PostList({ handle, posts, tagScope = "blog", emptyText }: PostListProps) {
  const { t } = useTranslation();
  const format = useDateFormat();
  if (posts.length === 0) {
    return <p className="post-list-empty">{emptyText ?? t("post:list.empty")}</p>;
  }
  return (
    <ul className="post-list" aria-label={t("post:list.label")}>
      {posts.map((post) => {
        const blogHandle = post.blogHandle ?? handle ?? "";
        return (
          <li key={post.id}>
            <article>
              <h2>
                <Link to={`/${blogHandle}/${post.id}`}>{post.title}</Link>
              </h2>
              {post.thumbnailUrl && (
                <img
                  {...thumbnailImage(post.thumbnailUrl, "card")}
                  alt=""
                  loading="lazy"
                  className="post-thumbnail"
                />
              )}
              {post.summary && <p>{post.summary}</p>}
              <p className="post-meta">
                {post.category && (
                  <>
                    <Link to={categoryHref(blogHandle, post.category.id)}>
                      {post.category.name}
                    </Link>{" "}
                  </>
                )}
                {post.publishedAt && (
                  <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
                )}{" "}
                <span>{t("post:views", { views: post.viewCount })}</span>
              </p>
              {post.tags.length > 0 && (
                <ul className="post-tags" aria-label={t("tag:list.label")}>
                  {post.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        to={tagScope === "global" ? tagHref(tag) : blogTagHref(blogHandle, tag)}
                      >
                        #{tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
