import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { PopularTag } from "~/api/models";
import { tagHref } from "~/components/post/PostList";
import { useDateFormat } from "~/i18n/format";

/** 인기 태그(003 FR-087): 서비스 전체 태그 글 목록 링크. 비면 그리지 않는다. */
export function PopularTags({ tags }: { tags: PopularTag[] }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  if (tags.length === 0) {
    return null;
  }
  const title = t("portal:home.popularTags");
  return (
    <section aria-label={title} className="portal-tags">
      <h2>{title}</h2>
      <ul>
        {tags.map((tag) => (
          <li key={tag.name}>
            <Link to={tagHref(tag.name)}>#{tag.name}</Link>{" "}
            <span>{format.number(tag.postCount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
