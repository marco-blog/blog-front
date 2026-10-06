import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";

import { errorMessage } from "~/api/errorMessage";
import type { SubscribeActionData } from "~/discovery/actions";

export interface SubscribeButtonProps {
  subscribed: boolean;
  subscriberCount: number;
  /** 내 블로그면 버튼 없이 수만 보인다. */
  isOwnBlog: boolean;
  /** 비로그인이면 이 블로그로 돌아오는 로그인 화면 주소, 로그인 회원이면 null */
  loginHref: string | null;
  /** JS 없이 보낸 폼의 결과(라우트 `useActionData`) */
  result?: SubscribeActionData;
}

/**
 * 블로그 구독(002 FR-031). 로그인 회원은 블로그 홈 `action`으로 `intent=subscribe|unsubscribe`를 보낸다
 * (JS가 있으면 `useFetcher`, 없으면 일반 POST). 비로그인은 로그인 링크, 내 블로그는 구독자 수만 보인다.
 */
export function SubscribeButton({
  subscribed,
  subscriberCount,
  isOwnBlog,
  loginHref,
  result,
}: SubscribeButtonProps) {
  const { t } = useTranslation();
  const fetcher = useFetcher<SubscribeActionData>();
  const latest = fetcher.data ?? result;
  const state = latest?.ok ? latest : { subscribed, subscriberCount };
  const error = latest && !latest.ok ? errorMessage(t, latest.resultCode) : null;
  const count = (
    <span className="subscriber-count">
      {t("discovery:subscribe.count", { count: state.subscriberCount })}
    </span>
  );

  if (isOwnBlog) {
    return <p className="subscribe">{count}</p>;
  }
  if (loginHref) {
    return (
      <p className="subscribe">
        {count} <Link to={loginHref}>{t("discovery:subscribe.loginToSubscribe")}</Link>
      </p>
    );
  }
  return (
    <fetcher.Form method="post" className="subscribe">
      <input type="hidden" name="intent" value={state.subscribed ? "unsubscribe" : "subscribe"} />
      <button type="submit" aria-pressed={state.subscribed} disabled={fetcher.state !== "idle"}>
        {state.subscribed
          ? t("discovery:subscribe.unsubscribe")
          : t("discovery:subscribe.subscribe")}
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
