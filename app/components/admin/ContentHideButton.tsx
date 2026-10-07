import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

import { HIDE_REASON_MAX } from "~/admin/contentSearch";

/**
 * 콘텐츠 관리 표의 행마다 "숨김"/"숨김 해제"(005 숨김 API, 006 T039). 숨김 상태(`HIDDEN`)면 해제 버튼만, 아니면 사유(필수,
 * 500자)와 숨김 버튼. 삭제된 콘텐츠에는 아무것도 없다.
 */
export function ContentHideButton({
  id,
  status,
  label,
}: {
  id: number;
  status: string;
  label: string;
}) {
  const { t } = useTranslation();
  const submitting = useNavigation().state === "submitting";
  if (status === "DELETED") {
    return null;
  }
  const intent = status === "HIDDEN" ? "unhide" : "hide";
  return (
    <Form method="post" className="content-hide">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      {intent === "hide" && (
        <>
          <input
            name="reason"
            required
            maxLength={HIDE_REASON_MAX}
            aria-label={`${t("admin:contents.hideReason")}: ${label}`}
            placeholder={t("admin:contents.hideReason")}
          />{" "}
        </>
      )}
      <button
        type="submit"
        disabled={submitting}
        aria-label={`${t(`admin:contents.${intent}`)}: ${label}`}
      >
        {t(`admin:contents.${intent}`)}
      </button>
    </Form>
  );
}

/** action 결과 문구(성공 안내 또는 오류) */
export function contentDoneKey(intent: string) {
  return intent === "unhide" ? "admin:contents.done.unhide" : "admin:contents.done.hide";
}
