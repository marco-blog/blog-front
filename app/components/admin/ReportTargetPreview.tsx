import { useTranslation } from "react-i18next";

import type { ReportTargetPreview as Preview } from "~/api/models";
import { isHttpUrl } from "~/moderation/reasons";

/** 링크로 만들 수 있는 주소(http·https만). 그 밖은 텍스트로 */
function SafeLink({ url, label }: { url: string; label: string }) {
  if (!isHttpUrl(url)) {
    return <span>{url}</span>;
  }
  return (
    <a href={url} rel="nofollow noopener noreferrer" target="_blank">
      {label}
    </a>
  );
}

/**
 * 신고 대상 미리보기(005 관리자 화면): 종류·상태, 제목·내용(텍스트로만), 작성자, 블로그, "원래 화면 열기".
 * `compact`면 목록 한 줄에 맞게 내용을 짧게 보여준다.
 */
export function ReportTargetPreview({
  target,
  compact = false,
}: {
  target: Preview | null;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  if (!target) {
    return <p className="report-target report-target-none">{t("admin:report.noTarget")}</p>;
  }
  const text =
    target.text && compact && target.text.length > 80
      ? `${target.text.slice(0, 80)}…`
      : target.text;
  const author = target.author
    ? target.author.guest
      ? t("admin:report.guestAuthor", { nickname: target.author.nickname ?? "" })
      : (target.author.nickname ?? "")
    : null;
  return (
    <div className="report-target">
      <p className="report-target-kind">
        <span className="badge">{t(`admin:reports.targetTypes.${target.type}`)}</span>{" "}
        <span className={`badge badge-state-${target.state.toLowerCase()}`}>
          {t(`admin:report.state.${target.state}`)}
        </span>{" "}
        {target.title && <strong className="report-target-title">{target.title}</strong>}
      </p>
      {text && (
        <p className="report-target-text" style={{ whiteSpace: "pre-wrap" }}>
          {text}
        </p>
      )}
      {!compact && (
        <dl className="report-target-meta">
          {author !== null && (
            <>
              <dt>{t("admin:report.author")}</dt>
              <dd>{author}</dd>
            </>
          )}
          {target.blog && (
            <>
              <dt>{t("admin:report.blog")}</dt>
              <dd>
                {target.blog.title}
                {target.blog.handle && ` (@${target.blog.handle})`}
              </dd>
            </>
          )}
        </dl>
      )}
      {!compact && target.url && (
        <p>
          <SafeLink url={target.url} label={t("admin:report.openOriginal")} />
        </p>
      )}
    </div>
  );
}
