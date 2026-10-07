import { useTranslation } from "react-i18next";
import { Form, useNavigation } from "react-router";

/**
 * 콘텐츠 관리 표의 행마다 "숨김"/"숨김 해제"(005 숨김 API, `ADMIN_FEATURES.contentHide`일 때만 그린다).
 * 숨김 상태(`HIDDEN`)면 해제, 아니면 숨김. 삭제된 콘텐츠에는 버튼이 없다.
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
    <Form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
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
