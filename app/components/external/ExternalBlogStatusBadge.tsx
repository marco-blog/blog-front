import { useTranslation } from "react-i18next";

import type { MyExternalBlog } from "~/api/models";
import { statusKey } from "~/external/status";

/** 외부 블로그 상태 배지(승인 대기·거절·수집 중·일시 중지·자동 중지·차단·해제, 해제 + 남긴 글이면 "해제 · 글 남김") */
export function ExternalBlogStatusBadge({
  blog,
}: {
  blog: Pick<MyExternalBlog, "status" | "postCount">;
}) {
  const { t } = useTranslation();
  return (
    <span className={`status-badge external-status external-status-${blog.status.toLowerCase()}`}>
      {t(statusKey(blog))}
    </span>
  );
}
