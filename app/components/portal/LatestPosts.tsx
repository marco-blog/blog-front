import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";

import type { PortalCard, TopicNode } from "~/api/models";
import { type PortalSource, sourceHref } from "~/external/sourceFilter";
import { latestFetchHref, latestHref } from "~/portal/cursor";

import { PortalCardList } from "./PortalCard";
import { SourceFilter } from "./SourceFilter";

/** 최신 글 한 묶음. `cursor`는 이 묶음을 부른 커서(첫 묶음은 null) */
export interface LatestBatch {
  cursor: string | null;
  items: PortalCard[];
  nextCursor: string | null;
}

export interface LatestPostsProps {
  initial: LatestBatch;
  topics: TopicNode[];
  now: string;
  /** 출처 필터(007). 기본 전체 */
  source?: PortalSource;
}

/**
 * 최신 글(003 FR-080, research P6): 발행 최신순, 블로그당 2편. "더 보기"는 JS가 없으면 `/?cursor=` 링크로 그 묶음을
 * SSR로 보여주고, JS가 있으면 같은 loader를 `useFetcher`로 불러 목록에 이어 붙인다. 다음 커서가 없으면 버튼이 없다.
 * 위의 출처 필터(007)는 `/?source=` 링크이고 "더 보기"도 그 출처를 이어 간다. 필터 결과가 비면 필터와 빈 안내만 보인다.
 */
export function LatestPosts({ initial, topics, now, source = "all" }: LatestPostsProps) {
  const { t } = useTranslation();
  const fetcher = useFetcher<{ cursorBatch: LatestBatch | null }>();
  // 첫 묶음이 바뀌면(다른 커서 주소) 부모가 key로 새로 그린다.
  const [batches, setBatches] = useState<LatestBatch[]>([initial]);

  // fetcher가 새 묶음을 받으면 렌더링 중에 한 번 이어 붙인다(이전 값과 비교, effect에서 setState하지 않음).
  const [appended, setAppended] = useState<LatestBatch | null>(null);
  const loaded = fetcher.state === "idle" ? (fetcher.data?.cursorBatch ?? null) : null;
  if (loaded && loaded !== appended) {
    setAppended(loaded);
    if (!batches.some((batch) => batch.cursor === loaded.cursor)) {
      setBatches([...batches, loaded]);
    }
  }

  const cards = batches.flatMap((batch) => batch.items);
  if (cards.length === 0 && source === "all") {
    return null;
  }
  const next = batches[batches.length - 1].nextCursor;
  const title = t("portal:home.latest");
  return (
    <section aria-label={title} className="portal-latest">
      <h2>{title}</h2>
      <SourceFilter current={source} hrefFor={(value) => sourceHref("/", value)} />
      {cards.length === 0 ? (
        <p className="portal-empty">{t("portal:source.empty")}</p>
      ) : (
        <PortalCardList cards={cards} topics={topics} now={now} label={title} />
      )}
      {next &&
        (fetcher.state === "idle" ? (
          <Link
            to={latestHref(next, source)}
            className="portal-more"
            onClick={(event) => {
              event.preventDefault();
              fetcher.load(latestFetchHref(next, source));
            }}
          >
            {t("portal:home.more")}
          </Link>
        ) : (
          <p aria-live="polite">{t("portal:home.loading")}</p>
        ))}
    </section>
  );
}
