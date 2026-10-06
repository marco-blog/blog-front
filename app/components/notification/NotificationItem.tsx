import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import type { Notification } from "~/api/models";
import { useDateFormat } from "~/i18n/format";

import { isKnownNotificationType } from "./links";

/** 알림 문구에 넣을 일으킨 회원 이름: 탈퇴 회원은 "탈퇴한 회원", 없으면 "알 수 없는 회원" */
function useActorName(actor: Notification["actor"]): string {
  const { t } = useTranslation();
  if (actor?.withdrawn) {
    return t("notification:withdrawnActor");
  }
  return actor?.nickname ?? t("notification:unknownActor");
}

/** params의 값을 문구에 넣을 문자열로(사용자 콘텐츠, 번역하지 않음). 없으면 빈 문자열 */
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * 알림 한 줄(002 FR-033). 문구는 `notification:types.{type}`에 일으킨 회원·글 제목·블로그 제목을 넣어 화면 언어로 만들고,
 * 모르는 종류는 `types.UNKNOWN`. 누르면 `intent=read`로 읽음 처리한 뒤 대상 화면으로 간다(JS 없이도 폼 전송).
 */
export function NotificationItem({ notification }: { notification: Notification }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const actor = useActorName(notification.actor);
  const type = isKnownNotificationType(notification.type) ? notification.type : "UNKNOWN";
  const message = t(`notification:types.${type}`, {
    actor,
    postTitle: text(notification.params.postTitle),
    blogTitle: text(notification.params.blogTitle) || notification.blog?.title || "",
  });

  return (
    <li className={notification.read ? "notification" : "notification notification-unread"}>
      <Form method="post">
        <input type="hidden" name="intent" value="read" />
        <input type="hidden" name="id" value={notification.id} />
        <button type="submit" className="notification-link">
          {!notification.read && (
            <>
              <span className="notification-unread-mark">{t("notification:unread")}</span>{" "}
            </>
          )}
          {message}
        </button>{" "}
        <time dateTime={notification.createdAt}>{format.dateTime(notification.createdAt)}</time>
      </Form>
    </li>
  );
}
