import { useTranslation } from "react-i18next";

import type { GuestbookEntry } from "~/api/models";

import type { GuestbookActionData } from "./actions";
import { GuestbookEntryItem } from "./GuestbookEntryItem";

export interface GuestbookListProps {
  entries: GuestbookEntry[];
  viewerId: number | null;
  isOwner: boolean;
  /** 블로그 관리: 회원 작성자에게 "차단" 버튼(004 US5) */
  showBlock?: boolean;
  result?: GuestbookActionData;
}

/** 방명록 최상위 글(최신순)과 각 글의 답글 */
export function GuestbookList({
  entries,
  viewerId,
  isOwner,
  showBlock = false,
  result,
}: GuestbookListProps) {
  const { t } = useTranslation();
  if (entries.length === 0) {
    return <p className="guestbook-empty">{t("guestbook:empty")}</p>;
  }
  return (
    <ul className="guestbook-list" aria-label={t("guestbook:list")}>
      {entries.map((entry) => (
        <GuestbookEntryItem
          key={`${entry.id}-${entry.updatedAt}-${entry.replies.length}`}
          entry={entry}
          viewerId={viewerId}
          isOwner={isOwner}
          showBlock={showBlock}
          result={result}
        />
      ))}
    </ul>
  );
}
