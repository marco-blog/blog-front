import { useTranslation } from "react-i18next";

import type { ReleaseNotePreview } from "~/api/models";
import { Toc } from "~/components/updates/Toc";

/**
 * 릴리스 노트 미리보기(006 T062): backend `POST /admin/release-notes/preview`가 게시 화면과 같은 규칙으로 살균한 HTML과 목차를
 * 독자 화면(003 `updates`)과 같은 클래스로 그린다. ESLint `dangerouslySetInnerHTML` 허용 목록에 있는 파일(001 R27).
 */
export function MarkdownPreview({
  preview,
  language,
}: {
  preview: ReleaseNotePreview;
  language: string;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="release-note-preview"
      aria-label={t("admin:releaseNotes.editor.previewOf", { language })}
    >
      <h2>{t("admin:releaseNotes.editor.previewOf", { language })}</h2>
      <Toc toc={preview.toc} />
      <div
        className="release-note-content"
        dangerouslySetInnerHTML={{ __html: preview.contentHtml }}
      />
    </section>
  );
}
