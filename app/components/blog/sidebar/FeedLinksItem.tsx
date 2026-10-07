import { useTranslation } from "react-i18next";

import { SidebarSection } from "./SidebarSection";

/** 피드 링크(RSS·Atom, 002 FR-046) */
export function FeedLinksItem({ handle }: { handle: string }) {
  const { t } = useTranslation();
  return (
    <SidebarSection type="FEED_LINKS" title={t("blog:sidebar.FEED_LINKS")}>
      <ul>
        <li>
          <a href={`/${handle}/rss`} type="application/rss+xml">
            RSS
          </a>
        </li>
        <li>
          <a href={`/${handle}/atom`} type="application/atom+xml">
            Atom
          </a>
        </li>
      </ul>
    </SidebarSection>
  );
}
