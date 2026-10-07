import { useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "~/api/client";
import type { TrackbackPing } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

/**
 * 보낸 트랙백 결과(005 FR-052): 주소마다 성공·실패(이유)·보내는 중. 상대가 준 메시지는 텍스트로만 보인다.
 * 기록을 읽지 못했으면(`pings` null) 안내만.
 */
export function PingResultList({ pings }: { pings: TrackbackPing[] | null }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  if (pings === null) {
    return <p className="form-hint">{t("trackback:pings.loadFailed")}</p>;
  }
  if (pings.length === 0) {
    return <p className="form-hint">{t("trackback:pings.empty")}</p>;
  }
  return (
    <ul className="trackback-pings" aria-label={t("trackback:pings.title")}>
      {pings.map((ping) => (
        <li key={ping.id}>
          <span className="trackback-ping-url">{ping.targetUrl}</span>{" "}
          <strong className={`trackback-ping-${ping.status.toLowerCase()}`}>
            {t(`trackback:pings.status.${ping.status}`)}
          </strong>
          {ping.status === "FAILED" && ping.errorCode && (
            <>
              {" "}
              <span>{t(`trackback:pings.error.${ping.errorCode}`)}</span>
              {ping.errorMessage && <span> ({ping.errorMessage})</span>}
            </>
          )}{" "}
          {ping.attemptedAt && (
            <time dateTime={ping.attemptedAt}>{format.dateTime(ping.attemptedAt)}</time>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 관리 글 목록의 "트랙백 결과" 펼침(005 contracts/routes.md `/:handle/manage/posts`). 처음 펼칠 때 브라우저에서
 * `GET /posts/{id}/trackback-pings`를 읽는다. JS가 없으면 글쓰기 화면의 발행 설정에서 볼 수 있다는 안내만.
 */
export function TrackbackPingDetails({ postId }: { postId: number }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [pings, setPings] = useState<TrackbackPing[] | null>(null);

  const load = () => {
    if (state !== "idle") return;
    setState("loading");
    api
      .get<TrackbackPing[]>(`/posts/${postId}/trackback-pings`)
      .then((result) => setPings(result))
      .catch(() => setPings(null))
      .finally(() => setState("done"));
  };

  return (
    <details
      className="trackback-ping-details"
      onToggle={(event) => {
        if (event.currentTarget.open) load();
      }}
    >
      <summary>{t("trackback:pings.toggle")}</summary>
      {state === "done" ? (
        <PingResultList pings={pings} />
      ) : (
        <p className="form-hint" aria-live="polite">
          {t(state === "loading" ? "trackback:pings.loading" : "trackback:pings.needsScript")}
        </p>
      )}
    </details>
  );
}
