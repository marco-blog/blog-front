import { useTranslation } from "react-i18next";

import type { Blog, SidebarItemType, SidebarView } from "~/api/models";
import { ArchiveList } from "~/components/blog/ArchiveList";
import { CategoryTree } from "~/components/blog/CategoryTree";
import { TagCloud } from "~/components/blog/TagCloud";

import { CommentsItem } from "./sidebar/CommentsItem";
import { FeedLinksItem } from "./sidebar/FeedLinksItem";
import { PostsItem } from "./sidebar/PostsItem";
import { ProfileItem } from "./sidebar/ProfileItem";
import { SearchItem } from "./sidebar/SearchItem";
import { SidebarSection } from "./sidebar/SidebarSection";
import { VisitorsItem } from "./sidebar/VisitorsItem";

/** 사이드바가 그리는 블로그 정보(`GET /blogs/{handle}`에서) */
export type SidebarBlog = Pick<Blog, "handle" | "description" | "owner" | "categories">;

/** 사이드바를 읽지 못했을 때(오류) 블로그 정보만으로 그리는 항목 */
export const FALLBACK_SIDEBAR_ITEMS: SidebarItemType[] = [
  "PROFILE",
  "CATEGORIES",
  "SEARCH",
  "FEED_LINKS",
];

export interface SidebarProps {
  blog: SidebarBlog;
  /** null이면 사이드바를 읽지 못함 */
  view: SidebarView | null;
  /** 지금 보고 있는 카테고리 */
  currentCategoryId?: number | null;
}

/**
 * 공개 블로그 사이드바(004 FR-060·061·067). 주인이 켠 항목만 정한 순서대로 그린다.
 * 프로필·카테고리·검색·피드 링크는 블로그 정보로, 나머지는 `GET /blogs/{handle}/sidebar`의 값으로 그린다.
 */
export function Sidebar({ blog, view, currentCategoryId = null }: SidebarProps) {
  const { t } = useTranslation();
  const items = view?.items ?? FALLBACK_SIDEBAR_ITEMS;
  const render = (type: SidebarItemType) => {
    switch (type) {
      case "PROFILE":
        return <ProfileItem description={blog.description} owner={blog.owner} />;
      case "CATEGORIES":
        return blog.categories.length === 0 ? null : (
          <CategoryTree
            handle={blog.handle}
            categories={blog.categories}
            currentId={currentCategoryId}
          />
        );
      case "RECENT_POSTS":
      case "POPULAR_POSTS": {
        const posts = type === "RECENT_POSTS" ? view?.recentPosts : view?.popularPosts;
        return posts ? <PostsItem type={type} handle={blog.handle} posts={posts} /> : null;
      }
      case "RECENT_COMMENTS":
        return view?.recentComments ? (
          <CommentsItem handle={blog.handle} comments={view.recentComments} />
        ) : null;
      case "TAGS":
        return view?.tags ? (
          <SidebarSection type="TAGS" title={t("blog:sidebar.TAGS")}>
            {view.tags.length === 0 ? (
              <p>{t("blog:tags.empty")}</p>
            ) : (
              <TagCloud handle={blog.handle} tags={view.tags} />
            )}
          </SidebarSection>
        ) : null;
      case "ARCHIVE":
        return view?.archive ? (
          <SidebarSection type="ARCHIVE" title={t("blog:sidebar.ARCHIVE")}>
            <ArchiveList handle={blog.handle} months={view.archive} />
          </SidebarSection>
        ) : null;
      case "VISITORS":
        return view?.visitors ? <VisitorsItem visitors={view.visitors} /> : null;
      case "SEARCH":
        return <SearchItem handle={blog.handle} />;
      case "FEED_LINKS":
        return <FeedLinksItem handle={blog.handle} />;
      default:
        return null;
    }
  };
  return (
    <aside className="blog-sidebar" aria-label={t("blog:sidebar.label")}>
      {items.map((type) => {
        const item = render(type);
        return item && <div key={type}>{item}</div>;
      })}
    </aside>
  );
}
