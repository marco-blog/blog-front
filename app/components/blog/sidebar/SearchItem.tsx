import { useId } from "react";
import { useTranslation } from "react-i18next";

import { SidebarSection } from "./SidebarSection";

/** 블로그 안 검색 폼. JS 없이 GET `/:handle/search?q=`로 간다. */
export function SearchItem({ handle }: { handle: string }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <SidebarSection type="SEARCH" title={t("blog:sidebar.SEARCH")}>
      <form method="get" action={`/${handle}/search`} role="search">
        <label htmlFor={id}>{t("blog:search.label")}</label>
        <input id={id} type="search" name="q" maxLength={100} required />
        <button type="submit">{t("blog:search.submit")}</button>
      </form>
    </SidebarSection>
  );
}
