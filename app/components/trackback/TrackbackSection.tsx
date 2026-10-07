import { useTranslation } from "react-i18next";

import type { Trackback } from "~/api/models";

import { TrackbackList } from "./TrackbackList";
import { TrackbackUrlBox } from "./TrackbackUrlBox";

export interface TrackbackSectionProps {
  trackbackUrl: string | null | undefined;
  /** 목록을 읽지 못했으면 null(글은 그대로 보여 준다) */
  trackbacks: Trackback[] | null;
  totalCount: number;
  page: number;
  pageSize: number;
  hrefFor: (page: number) => string;
  reportable?: boolean;
}

/** 글 상세의 "트랙백" 영역(005 contracts/routes.md): 이 글의 트랙백 주소와 받은 트랙백 목록. 댓글 위에 둔다. */
export function TrackbackSection({
  trackbackUrl,
  trackbacks,
  totalCount,
  ...listProps
}: TrackbackSectionProps) {
  const { t } = useTranslation();
  return (
    <section id="trackbacks" className="trackbacks" aria-labelledby="trackbacks-title">
      <h2 id="trackbacks-title">{t("trackback:heading", { count: totalCount })}</h2>
      <TrackbackUrlBox url={trackbackUrl} />
      {trackbacks === null ? (
        <p className="form-hint">{t("trackback:loadFailed")}</p>
      ) : (
        <TrackbackList trackbacks={trackbacks} totalCount={totalCount} {...listProps} />
      )}
    </section>
  );
}
