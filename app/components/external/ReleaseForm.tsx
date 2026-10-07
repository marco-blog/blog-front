import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Form } from "react-router";

import type { MyExternalBlog } from "~/api/models";
import { FormAlert } from "~/components/form/FormField";

/** 해제할 수 있는 상태(backend `ExternalBlog.release`). 해제된 등록은 남긴 글 삭제만 */
export const RELEASABLE_STATUSES: readonly string[] = ["PENDING", "ACTIVE", "PAUSED", "STOPPED"];

export interface ReleaseFormProps {
  blog: Pick<MyExternalBlog, "status" | "postCount">;
  action: string;
  /** 이 폼의 결과 오류(선택 안 함 등) */
  error?: string | null;
  /** `deletePosts` 칸 오류 */
  choiceError?: string | null;
}

/**
 * 등록 해제 폼(007 T085, contracts/routes.md, 결정 표 24번): "남기기"·"삭제" 라디오(필수, 기본 선택 없음)와 선택별 확인 문구.
 * 해제된 등록은 남긴 글이 있을 때만 "남긴 글 삭제"(확인 문구). 차단·거절은 그리지 않는다.
 */
export function ReleaseForm({ blog, action, error = null, choiceError = null }: ReleaseFormProps) {
  const { t } = useTranslation();
  const confirmChoice = (event: FormEvent<HTMLFormElement>) => {
    const choice = new FormData(event.currentTarget).get("deletePosts");
    if (choice !== "true" && choice !== "false") {
      return; // 서버가 "골라 주세요"를 돌려준다
    }
    const message =
      choice === "true" ? t("external:manage.detail.delete") : t("external:manage.detail.keep");
    if (!window.confirm(message)) {
      event.preventDefault();
    }
  };
  const confirmDeleteKept = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(t("external:manage.detail.deleteKeptConfirm"))) {
      event.preventDefault();
    }
  };

  if (blog.status === "RELEASED") {
    if (blog.postCount <= 0) {
      return null;
    }
    return (
      <section className="external-release">
        <h2>{t("external:manage.detail.deleteKept")}</h2>
        <Form method="post" action={action} onSubmit={confirmDeleteKept}>
          <input type="hidden" name="intent" value="release" />
          <input type="hidden" name="deletePosts" value="true" />
          <p className="field-hint">{t("external:manage.detail.deleteKeptConfirm")}</p>
          <FormAlert message={error} />
          <button type="submit">{t("external:manage.detail.deleteKept")}</button>
        </Form>
      </section>
    );
  }
  if (!RELEASABLE_STATUSES.includes(blog.status)) {
    return null;
  }
  return (
    <section className="external-release">
      <h2>{t("external:manage.detail.release")}</h2>
      <Form method="post" action={action} onSubmit={confirmChoice}>
        <input type="hidden" name="intent" value="release" />
        <fieldset aria-invalid={choiceError ? true : undefined}>
          <legend>{t("external:manage.detail.releaseIntro")}</legend>
          <label>
            <input type="radio" name="deletePosts" value="false" />{" "}
            {t("external:manage.detail.keep")}
          </label>
          <label>
            <input type="radio" name="deletePosts" value="true" />{" "}
            {t("external:manage.detail.delete")}
          </label>
        </fieldset>
        {choiceError && (
          <p className="field-error" role="alert">
            {choiceError}
          </p>
        )}
        <FormAlert message={error} />
        <button type="submit">{t("external:manage.detail.releaseSubmit")}</button>
      </Form>
    </section>
  );
}
