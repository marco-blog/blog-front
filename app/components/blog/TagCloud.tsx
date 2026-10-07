import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { BlogTag } from "~/api/models";
import { withTagWeights } from "~/blog/tagWeight";
import { blogTagHref } from "~/components/post/PostList";
import { useDateFormat } from "~/i18n/format";

export interface TagCloudProps {
  handle: string;
  tags: BlogTag[];
  /** 이름순으로 다시 늘어놓을지(블로그 태그 목록). 사이드바는 받은 순서(글 수 순) */
  sortByName?: boolean;
  label?: string;
}

/** 블로그 태그(글 수가 많을수록 큰 글자, 5단계 `tag-weight-{1..5}`). 누르면 블로그 안 태그별 글 */
export function TagCloud({ handle, tags, sortByName = false, label }: TagCloudProps) {
  const { t, i18n } = useTranslation();
  const format = useDateFormat();
  const ordered = sortByName
    ? [...tags].sort((a, b) => a.name.localeCompare(b.name, i18n.language))
    : tags;
  return (
    <ul className="tag-cloud" aria-label={label ?? t("blog:tags.label")}>
      {withTagWeights(ordered).map((tag) => (
        <li key={tag.name} className={`tag-weight-${tag.weight}`}>
          <Link to={blogTagHref(handle, tag.name)}>
            #{tag.name} <span className="tag-count">({format.number(tag.postCount)})</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
