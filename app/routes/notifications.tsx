import { useTranslation } from "react-i18next";
import { Form, data, redirect, useActionData, useLoaderData } from "react-router";

import { createApiClient } from "~/api/client.server";
import { errorMessage } from "~/api/errorMessage";
import { isApiError, throwApiErrorResponse } from "~/api/errors";
import type { BulkNotificationRequest, BulkNotificationResult, Notification } from "~/api/models";
import { loginPath, requireUser } from "~/auth/session.server";
import { parsePostId } from "~/blog/ids";
import { parsePage, withPage } from "~/blog/listing";
import { FormAlert } from "~/components/form/FormField";
import { NOTIFICATIONS_PATH, notificationHref } from "~/components/notification/links";
import { NotificationItem } from "~/components/notification/NotificationItem";
import { Pagination } from "~/components/Pagination";
import { metaT } from "~/i18n/meta";
import { privatePageMeta } from "~/seo/meta";

import type { Route } from "./+types/notifications";

/** 한 페이지 알림 수 */
export const PAGE_SIZE = 20;

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return privatePageMeta(t("notification:title"), t("appName"));
}

/** 내 알림(`/notifications`, SSR, 002 FR-033): 최신순 20개씩. 로그인 회원만 본다. */
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const page = parsePage(new URL(request.url).searchParams.get("page"));
  const { result, totalCount } = await createApiClient(request)
    .send<Notification[]>("/me/notifications", { query: { page: page - 1, size: PAGE_SIZE } })
    .catch(throwApiErrorResponse);
  return {
    notifications: result,
    totalCount: totalCount ?? result.length,
    page,
    pageSize: PAGE_SIZE,
  };
}

export interface NotificationActionData {
  ok: false;
  resultCode: string;
}

/**
 * `intent=read`: 알림 하나를 읽음으로 바꾸고 그 대상 화면으로 간다. `intent=read-all`: 안 읽은 알림을 모두 읽음으로.
 * 로그인이 풀렸으면 알림 화면으로 돌아오는 로그인 화면으로 보낸다.
 */
export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const api = createApiClient(request);
  try {
    if (intent === "read") {
      const id = parsePostId(String(form.get("id") ?? ""));
      if (id === null) {
        return data<NotificationActionData>(
          { ok: false, resultCode: "VALIDATION_FAILED" },
          { status: 400 },
        );
      }
      const notification = await api.post<Notification>(`/me/notifications/${id}/read`);
      return redirect(notificationHref(notification));
    }
    if (intent === "read-all") {
      await api.post<BulkNotificationResult>("/me/notifications/bulk", {
        body: { action: "MARK_READ" } satisfies BulkNotificationRequest,
      });
      return redirect(NOTIFICATIONS_PATH);
    }
    return data<NotificationActionData>(
      { ok: false, resultCode: "VALIDATION_FAILED" },
      { status: 400 },
    );
  } catch (error) {
    if (!isApiError(error)) {
      throw error;
    }
    if (error.status === 401) {
      throw redirect(loginPath(NOTIFICATIONS_PATH));
    }
    return data<NotificationActionData>(
      { ok: false, resultCode: error.resultCode },
      { status: error.status },
    );
  }
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, totalCount, page, pageSize } = useLoaderData<typeof loader>();
  const result = useActionData<NotificationActionData>();
  const hasUnread = notifications.some((notification) => !notification.read);

  return (
    <main className="notifications">
      <h1>{t("notification:title")}</h1>
      <FormAlert message={result ? errorMessage(t, result.resultCode) : null} />
      {hasUnread && (
        <Form method="post">
          <input type="hidden" name="intent" value="read-all" />
          <button type="submit">{t("notification:readAll")}</button>
        </Form>
      )}
      {notifications.length === 0 ? (
        <p>{t("notification:empty")}</p>
      ) : (
        <ul className="notification-list" aria-label={t("notification:label")}>
          {notifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </ul>
      )}
      <Pagination
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
        hrefFor={(target) => withPage(NOTIFICATIONS_PATH, target)}
      />
    </main>
  );
}
