import { useTranslation } from "react-i18next";

import type { FeedPost } from "~/api/models";
import { withPage } from "~/blog/listing";
import { Pagination } from "~/components/Pagination";

import { PostList } from "./PostList";

export interface FeedPostListProps {
  posts: FeedPost[];
  page: number;
  totalCount: number;
  pageSize: number;
}

/** 구독 피드 글 목록(002 FR-032): 글마다 블로그 이름(블로그 홈 링크)·제목·요약·발행일, 아래에 페이지 이동 */
export function FeedPostList({ posts, page, totalCount, pageSize }: FeedPostListProps) {
  const { t } = useTranslation();
  return (
    <>
      <PostList posts={posts} emptyText={t("discovery:feed.empty")} />
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => withPage("/feed", target)}
      />
    </>
  );
}
