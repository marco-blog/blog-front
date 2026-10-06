import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Visibility } from "~/api/models";

export interface PublishSettingsValue {
  visibility: Visibility;
  commentEnabled: boolean;
}

export interface PublishSettingsDialogProps {
  /** 이미 발행한 글이면 버튼이 "수정 발행"(FR-108) */
  published: boolean;
  initial: PublishSettingsValue;
  pending?: boolean;
  /** 발행 실패 문구 */
  error?: string | null;
  onClose: () => void;
  onPublish: (value: PublishSettingsValue) => void;
}

/**
 * 발행 설정 레이어(FR-013, FR-107). "완료"를 누르면 열리고, 여기서 발행 버튼을 눌러야만 발행된다.
 * 닫으면 작성 화면으로 돌아가고 글은 임시저장 상태로 남는다(AS8).
 * 공개 범위(공개·비공개), 발행 시각(지금), 댓글 허용. 카테고리·태그는 US2, 대표 이미지는 US4에서 더한다.
 */
export function PublishSettingsDialog({
  published,
  initial,
  pending = false,
  error,
  onClose,
  onPublish,
}: PublishSettingsDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [commentEnabled, setCommentEnabled] = useState(initial.commentEnabled);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  let publishLabel = t("post:publish.publishPublic");
  if (published) {
    publishLabel = t("post:publish.republish");
  } else if (visibility === "PRIVATE") {
    publishLabel = t("post:publish.savePrivate");
  }

  return (
    <div className="publish-settings" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h2 id={titleId}>{t("post:publish.title")}</h2>
      <fieldset>
        <legend>{t("post:publish.visibility")}</legend>
        <label>
          <input
            type="radio"
            name="visibility"
            value="PUBLIC"
            checked={visibility === "PUBLIC"}
            onChange={() => setVisibility("PUBLIC")}
          />
          {t("post:publish.public")}
        </label>
        <label>
          <input
            type="radio"
            name="visibility"
            value="PRIVATE"
            checked={visibility === "PRIVATE"}
            onChange={() => setVisibility("PRIVATE")}
          />
          {t("post:publish.private")}
        </label>
      </fieldset>
      <p>
        {t("post:publish.publishTime")}: {t("post:publish.now")}
      </p>
      <label>
        <input
          type="checkbox"
          name="commentEnabled"
          checked={commentEnabled}
          onChange={(event) => setCommentEnabled(event.target.checked)}
        />
        {t("post:publish.commentEnabled")}
      </label>
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose} disabled={pending}>
          {t("post:publish.close")}
        </button>
        <button
          type="button"
          onClick={() => onPublish({ visibility, commentEnabled })}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {publishLabel}
        </button>
      </div>
      {pending && <p aria-live="polite">{t("post:publish.publishing")}</p>}
    </div>
  );
}
