import { data, redirect } from "react-router";

import { createApiClient } from "~/api/client.server";
import { isApiError } from "~/api/errors";
import type { LikeState, SubscriptionState } from "~/api/models";
import { loginPath } from "~/auth/paths";

import type { LikeActionData, LikeIntent, SubscribeActionData, SubscribeIntent } from "./actions";

/** 로그인이 풀렸으면(401) 돌아올 주소를 붙인 로그인 화면으로, 그 밖의 backend 오류는 상태 코드와 함께 돌려준다. */
function failure<T>(error: unknown, returnTo: string, build: (resultCode: string) => T) {
  if (!isApiError(error)) {
    throw error;
  }
  if (error.status === 401) {
    throw redirect(loginPath(returnTo));
  }
  return data<T>(build(error.resultCode), { status: error.status });
}

/** 좋아요 누르기(`PUT /me/likes/{postId}`)·취소(`DELETE`). 응답의 수로 화면을 고친다. */
export async function runLikeAction(
  request: Request,
  intent: LikeIntent,
  options: { postId: number; returnTo: string },
) {
  const api = createApiClient(request);
  const path = `/me/likes/${options.postId}`;
  try {
    const state =
      intent === "like" ? await api.put<LikeState>(path) : await api.delete<LikeState>(path);
    return data<LikeActionData>({
      intent,
      ok: true,
      liked: state.liked,
      likeCount: state.likeCount,
    });
  } catch (error) {
    return failure<LikeActionData>(error, options.returnTo, (resultCode) => ({
      intent,
      ok: false,
      resultCode,
    }));
  }
}

/** 구독(`PUT /me/subscriptions/{handle}`)·취소(`DELETE`). */
export async function runSubscribeAction(
  request: Request,
  intent: SubscribeIntent,
  options: { handle: string; returnTo: string },
) {
  const api = createApiClient(request);
  const path = `/me/subscriptions/${options.handle}`;
  try {
    const state =
      intent === "subscribe"
        ? await api.put<SubscriptionState>(path)
        : await api.delete<SubscriptionState>(path);
    return data<SubscribeActionData>({
      intent,
      ok: true,
      subscribed: state.subscribed,
      subscriberCount: state.subscriberCount,
    });
  } catch (error) {
    return failure<SubscribeActionData>(error, options.returnTo, (resultCode) => ({
      intent,
      ok: false,
      resultCode,
    }));
  }
}
