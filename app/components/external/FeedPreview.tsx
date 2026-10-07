import { useTranslation } from "react-i18next";

import type { FeedPreview as FeedPreviewData } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

/**
 * 미리보기 결과(블로그 이름·최근 글 3편). 외부에서 온 이름·제목은 번역하지 않고 그대로(이스케이프) 보인다.
 * 이미 등록된 피드면 "내가 등록함 / 넘겨받기 가능 / 넘겨받기 불가" 안내를 붙인다.
 */
export function FeedPreview({ preview }: { preview: FeedPreviewData }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const registered = preview.registered;
  return (
    <section className="external-preview" aria-label={t("external:manage.new.previewTitle")}>
      <h2>{t("external:manage.new.previewTitle")}</h2>
      <dl>
        <dt>{t("external:common.name")}</dt>
        <dd>{preview.title ?? t("external:common.untitled")}</dd>
        {preview.siteUrl && (
          <>
            <dt>{t("external:common.siteUrl")}</dt>
            <dd>{preview.siteUrl}</dd>
          </>
        )}
        <dt>{t("external:common.feedUrl")}</dt>
        <dd>
          <code>{preview.feedUrl}</code> ({preview.format})
        </dd>
      </dl>
      <h3>{t("external:manage.new.recentPosts")}</h3>
      {preview.recentPosts.length === 0 ? (
        <p>{t("external:manage.new.noRecentPosts")}</p>
      ) : (
        <ul className="external-recent-posts">
          {preview.recentPosts.map((post) => (
            <li key={post.link}>
              <a href={post.link} target="_blank" rel="noopener nofollow noreferrer">
                {post.title}
              </a>{" "}
              {post.publishedAt && (
                <time dateTime={post.publishedAt}>{format.date(post.publishedAt)}</time>
              )}
            </li>
          ))}
        </ul>
      )}
      {registered && (
        <p className="form-alert" role="status">
          {t(
            registered.mine
              ? "external:manage.new.registeredMine"
              : registered.claimable
                ? "external:manage.new.registeredClaimable"
                : "external:manage.new.registeredBlocked",
          )}
        </p>
      )}
    </section>
  );
}
