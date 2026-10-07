import { useTranslation } from "react-i18next";

import type { VisitorCounts } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

import { SidebarSection } from "./SidebarSection";

/** 방문자 수(오늘·어제·전체, 004 FR-067) */
export function VisitorsItem({ visitors }: { visitors: VisitorCounts }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  return (
    <SidebarSection type="VISITORS" title={t("blog:sidebar.VISITORS")}>
      <dl className="visitor-counts">
        <div>
          <dt>{t("blog:visitors.today")}</dt>
          <dd>{format.number(visitors.today)}</dd>
        </div>
        <div>
          <dt>{t("blog:visitors.yesterday")}</dt>
          <dd>{format.number(visitors.yesterday)}</dd>
        </div>
        <div>
          <dt>{t("blog:visitors.total")}</dt>
          <dd>{format.number(visitors.total)}</dd>
        </div>
      </dl>
    </SidebarSection>
  );
}
