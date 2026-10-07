import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import { REPORT_RESOLVED_NOTIFICATION, type Notification } from "~/api/models";
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
 * 문구 키 이름. 005 신고 처리 알림은 결과(`params.decision`)에 따라 "조치했습니다"·"조치하지 않았습니다"로 나누고,
 * 결과를 모르면 공통 문구. 대상 제목·내용은 알림에 없다.
 */
function messageKey(notification: Notification): string {
  if (!isKnownNotificationType(notification.type)) {
    return "UNKNOWN";
  }
  if (notification.type === REPORT_RESOLVED_NOTIFICATION) {
    const decision = notification.params.decision;
    return decision === "ACTIONED" || decision === "DISMISSED"
      ? `${REPORT_RESOLVED_NOTIFICATION}_${decision}`
      : REPORT_RESOLVED_NOTIFICATION;
  }
  return notification.type;
}

/**
 * 알림 한 줄(002 FR-033). 문구는 `notification:types.{type}`에 일으킨 회원·글 제목·블로그 제목을 넣어 화면 언어로 만들고,
 * 모르는 종류는 `types.UNKNOWN`. 누르면 `intent=read`로 읽음 처리한 뒤 대상 화면으로 간다(JS 없이도 폼 전송).
 */
export function NotificationItem({ notification }: { notification: Notification }) {
  const { t } = useTranslation();
  const format = useDateFormat();
  const actor = useActorName(notification.actor);
  const message = t(`notification:types.${messageKey(notification)}`, {
    actor,
    postTitle: text(notification.params.postTitle),
    blogTitle: text(notification.params.blogTitle) || notification.blog?.title || "",
    // BACKUP_READY(004): 내려받을 수 있는 마지막 시각을 화면 언어·회원 시간대로
    expiresAt: format.dateTime(text(notification.params.expiresAt) || null),
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
