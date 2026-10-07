import { useTranslation } from "react-i18next";
import { Link, useFetcher, useLocation } from "react-router";

import { versionHref } from "~/updates/versionTree";

export interface UnseenReleaseNote {
  version: string;
  title: string;
}

/**
 * 새 릴리스 노트 배너(003 FR-163): 상단 아래 한 줄로 새 버전 번호·제목·"보기". 닫기는 `/updates/seen`으로 보내고
 * (JS가 없으면 지금 화면으로 돌아오고, 있으면 fetcher로 보내 바로 숨긴다). 그 버전 화면에서는 보이지 않는다.
 */
export function ReleaseNoteBanner({ note }: { note: UnseenReleaseNote }) {
  const { t } = useTranslation();
  const location = useLocation();
  const fetcher = useFetcher();
  const href = versionHref(note.version);
  if (fetcher.state !== "idle" || fetcher.data || location.pathname === href) {
    return null;
  }
  const next = `${location.pathname}${location.search}`;
  return (
    <aside aria-label={t("updates:banner.label")} className="release-note-banner">
      <p>
        {t("updates:banner.text", { version: note.version, title: note.title })}{" "}
        <Link to={href}>{t("updates:banner.view")}</Link>
      </p>
      {/* JS가 없으면 보통 폼 전송(서버가 next로 리다이렉트), 있으면 fetcher로 보내고 바로 숨긴다. */}
      <form
        method="post"
        action="/updates/seen"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          form.set("js", "1");
          void fetcher.submit(form, { method: "post", action: "/updates/seen" });
        }}
      >
        <input type="hidden" name="version" value={note.version} />
        <input type="hidden" name="next" value={next} />
        <button type="submit">{t("updates:banner.dismiss")}</button>
      </form>
    </aside>
  );
}
