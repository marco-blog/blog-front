import { useTranslation } from "react-i18next";

import type { ReleaseNoteTocEntry } from "~/api/models";

/** 본문 목차(h2~h4, 003 FR-159). 앵커는 backend가 제목에 붙인 id다. 비면 그리지 않는다. */
export function Toc({ toc }: { toc: readonly ReleaseNoteTocEntry[] }) {
  const { t } = useTranslation();
  if (toc.length === 0) {
    return null;
  }
  return (
    <nav aria-label={t("updates:toc")} className="release-note-toc">
      <ol>
        {toc.map((entry) => (
          <li key={entry.anchor} className={`toc-level-${entry.level}`}>
            <a href={`#${entry.anchor}`}>{entry.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
