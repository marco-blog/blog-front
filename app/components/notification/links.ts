import { NOTIFICATION_TYPES, type KnownNotificationType, type Notification } from "~/api/models";
import { isValidHandle } from "~/blog/ids";

/** 알림 목록 주소 */
export const NOTIFICATIONS_PATH = "/notifications";

export function isKnownNotificationType(type: string): type is KnownNotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type);
}

/** 숫자 id만(주소에 넣을 값) */
function idOf(value: unknown): number | null {
  const number = typeof value === "string" && /^\d{1,16}$/.test(value) ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0 ? number : null;
}

/**
 * 알림이 가리키는 화면(002 contracts/api.md): NEW_COMMENT → `/{handle}/{postId}#comment-{targetId}`,
 * NEW_SUBSCRIBER → `/{handle}`. 갈 곳을 알 수 없으면(모르는 종류, 값이 빠짐) 알림 목록.
 */
export function notificationHref(
  notification: Pick<Notification, "type" | "blog" | "params" | "targetId">,
): string {
  const handle = notification.blog?.handle;
  if (!isValidHandle(handle)) {
    return NOTIFICATIONS_PATH;
  }
  if (notification.type === "NEW_COMMENT") {
    const postId = idOf(notification.params.postId);
    if (postId === null) {
      return NOTIFICATIONS_PATH;
    }
    const commentId = idOf(notification.targetId);
    return `/${handle}/${postId}${commentId === null ? "" : `#comment-${commentId}`}`;
  }
  if (notification.type === "NEW_SUBSCRIBER") {
    return `/${handle}`;
  }
  return NOTIFICATIONS_PATH;
}
