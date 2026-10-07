import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { SidebarPost } from "~/api/models";

import { SidebarSection } from "./SidebarSection";

/** 최근 글·인기 글(5편) */
export function PostsItem({
  type,
  handle,
  posts,
}: {
  type: "RECENT_POSTS" | "POPULAR_POSTS";
  handle: string;
  posts: SidebarPost[];
}) {
  const { t } = useTranslation();
  return (
    <SidebarSection type={type} title={t(`blog:sidebar.${type}`)}>
      {posts.length === 0 ? (
        <p>{t("blog:sidebar.noPosts")}</p>
      ) : (
        <ul>
          {posts.map((post) => (
            <li key={post.id}>
              <Link to={`/${handle}/${post.id}`}>{post.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}
