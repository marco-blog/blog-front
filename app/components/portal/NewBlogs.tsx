import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { NewBlog } from "~/api/models";
import { Avatar } from "~/components/media/Avatar";
import { useRelativeTime } from "~/i18n/format";
import { thumbnailImage } from "~/media/thumbnail";

/** 새로 시작한 블로그(003 FR-087): 블로그 이름·소개·주인·첫 발행 시각. 비면 그리지 않는다. */
export function NewBlogs({ blogs, now }: { blogs: NewBlog[]; now: string }) {
  const { t } = useTranslation();
  const relative = useRelativeTime(now);
  if (blogs.length === 0) {
    return null;
  }
  const title = t("portal:home.newBlogs");
  return (
    <section aria-label={title} className="portal-new-blogs">
      <h2>{title}</h2>
      <ul>
        {blogs.map((blog) => (
          <li key={blog.handle}>
            <article>
              {blog.coverImageUrl && (
                <img {...thumbnailImage(blog.coverImageUrl, "card")} alt="" loading="lazy" />
              )}
              <h3>
                <Link to={`/${blog.handle}`}>{blog.title}</Link>
              </h3>
              {blog.description && <p>{blog.description}</p>}
              <p>
                <Avatar url={blog.owner.profileImageUrl} /> {blog.owner.nickname}{" "}
                <time dateTime={blog.firstPublishedAt}>
                  {t("portal:home.newBlogSince", { time: relative(blog.firstPublishedAt) })}
                </time>
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
