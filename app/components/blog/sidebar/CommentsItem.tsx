import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { SidebarComment } from "~/api/models";

import { SidebarSection } from "./SidebarSection";

/** 최근 댓글(비밀이 아닌 댓글 5개, 50자 발췌, 비회원 표시) */
export function CommentsItem({ handle, comments }: { handle: string; comments: SidebarComment[] }) {
  const { t } = useTranslation();
  return (
    <SidebarSection type="RECENT_COMMENTS" title={t("blog:sidebar.RECENT_COMMENTS")}>
      {comments.length === 0 ? (
        <p>{t("blog:sidebar.noComments")}</p>
      ) : (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id}>
              <Link to={`/${handle}/${comment.postId}#comment-${comment.id}`}>
                {comment.excerpt}
              </Link>{" "}
              <span className="sidebar-comment-author">
                {comment.authorName}
                {comment.guest && <> ({t("guestbook:entry.guest")})</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SidebarSection>
  );
}
