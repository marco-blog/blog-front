import { useTranslation } from "react-i18next";

import type { LegalDocument } from "~/api/models";
import { PostContent } from "~/components/post/PostContent";
import { useDateFormat } from "~/i18n/format";

/**
 * 약관·개인정보처리방침 화면. 한국어판이 기준이므로 다른 언어판에는 "한국어판 우선" 안내를 붙인다(FR-155).
 * 본문은 backend가 Markdown을 변환·살균한 HTML이라 글 본문과 같은 출력 컴포넌트를 쓴다(research.md R27 예외 한 곳).
 */
export function LegalDocumentView({ title, document }: { title: string; document: LegalDocument }) {
  const { t } = useTranslation();
  const { date } = useDateFormat();
  return (
    <main className="legal">
      <h1>{title}</h1>
      <p>{t("legal:meta", { version: document.version, date: date(document.effectiveAt) })}</p>
      {document.lang !== document.authoritativeLang && (
        <p role="note">{t("legal:translationNotice")}</p>
      )}
      <PostContent html={document.contentHtml} />
    </main>
  );
}
