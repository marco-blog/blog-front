import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";

import { errorMessage } from "~/api/errorMessage";
import type { LikeActionData } from "~/discovery/actions";

export interface LikeButtonProps {
  liked: boolean;
  likeCount: number;
  /** 비로그인이면 이 글로 돌아오는 로그인 화면 주소, 로그인 회원이면 null */
  loginHref: string | null;
  /** JS 없이 보낸 폼의 결과(라우트 `useActionData`) */
  result?: LikeActionData;
}

/**
 * 좋아요(002 FR-030). 로그인 회원은 글 상세 `action`으로 `intent=like|unlike`를 보낸다. JS가 있으면 `useFetcher`로
 * 화면을 바꾸지 않고 보내고 응답의 수로 고치며, JS가 없으면 일반 POST다. 비로그인은 로그인 링크만 보인다.
 */
export function LikeButton({ liked, likeCount, loginHref, result }: LikeButtonProps) {
  const { t } = useTranslation();
  const fetcher = useFetcher<LikeActionData>();
  const latest = fetcher.data ?? result;
  const state = latest?.ok ? latest : { liked, likeCount };
  const error = latest && !latest.ok ? errorMessage(t, latest.resultCode) : null;
  const count = (
    <span className="like-count">{t("discovery:like.count", { count: state.likeCount })}</span>
  );

  if (loginHref) {
    return (
      <p className="like">
        {count} <Link to={loginHref}>{t("discovery:like.loginToLike")}</Link>
      </p>
    );
  }
  return (
    <fetcher.Form method="post" className="like">
      <input type="hidden" name="intent" value={state.liked ? "unlike" : "like"} />
      <button type="submit" aria-pressed={state.liked} disabled={fetcher.state !== "idle"}>
        {state.liked ? t("discovery:like.unlike") : t("discovery:like.like")}
      </button>{" "}
      {count}
      {error && (
        <span role="alert" className="form-alert">
          {error}
        </span>
      )}
    </fetcher.Form>
  );
}
