/** 좋아요·구독 `action`의 작업과 결과(직렬화 가능, 002 FR-030·031). 서버 처리는 actions.server.ts. */

export type LikeIntent = "like" | "unlike";
export type SubscribeIntent = "subscribe" | "unsubscribe";

export const LIKE_INTENTS: readonly LikeIntent[] = ["like", "unlike"];
export const SUBSCRIBE_INTENTS: readonly SubscribeIntent[] = ["subscribe", "unsubscribe"];

export type LikeActionData =
  | { intent: LikeIntent; ok: true; liked: boolean; likeCount: number }
  | { intent: LikeIntent; ok: false; resultCode: string };

export type SubscribeActionData =
  | { intent: SubscribeIntent; ok: true; subscribed: boolean; subscriberCount: number }
  | { intent: SubscribeIntent; ok: false; resultCode: string };

export function isLikeIntent(value: unknown): value is LikeIntent {
  return typeof value === "string" && (LIKE_INTENTS as readonly string[]).includes(value);
}

export function isSubscribeIntent(value: unknown): value is SubscribeIntent {
  return typeof value === "string" && (SUBSCRIBE_INTENTS as readonly string[]).includes(value);
}

/** 폼 전송의 `intent` 값(본문을 읽지 않도록 복사본에서 읽는다). */
export async function formIntent(request: Request): Promise<string> {
  const form = await request.clone().formData();
  return String(form.get("intent") ?? "");
}
