import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { PORTAL_SOURCES, type PortalSource } from "~/external/sourceFilter";

export interface SourceFilterProps {
  current: PortalSource;
  /** 그 출처로 가는 주소(커서·페이지는 버린 주소) */
  hrefFor: (source: PortalSource) => string;
}

/**
 * 출처 필터(007 FR-120): 전체·내부 글만·외부 글만 링크(JS 없이 동작), 지금 값은 `aria-current`. 스크롤 위치는 유지한다.
 */
export function SourceFilter({ current, hrefFor }: SourceFilterProps) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("portal:source.label")} className="portal-source">
      {PORTAL_SOURCES.map((value) => (
        <Link
          key={value}
          to={hrefFor(value)}
          preventScrollReset
          aria-current={value === current ? "page" : undefined}
        >
          {t(`portal:source.${value}`)}
        </Link>
      ))}
    </nav>
  );
}
