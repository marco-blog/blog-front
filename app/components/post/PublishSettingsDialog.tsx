import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CategoryNode, TopicNode, Visibility } from "~/api/models";
import { CategorySelect } from "~/components/blog/CategoryTree";
import { TagInput } from "~/components/post/TagInput";
import { TopicSelect } from "~/components/post/TopicSelect";
import { mediaUrl, thumbnailImage } from "~/media/thumbnail";

export interface PublishSettingsValue {
  visibility: Visibility;
  commentEnabled: boolean;
  categoryId: number | null;
  tags: string[];
  /** 주제(소분류, 003 FR-076). null이면 "선택 안 함" */
  topicId: number | null;
  /** 대표 이미지(본문 이미지 중 하나). 본문에 이미지가 없으면 null */
  thumbnailMediaKey: string | null;
}

export interface PublishSettingsDialogProps {
  /** 이미 발행한 글이면 버튼이 "수정 발행"(FR-108) */
  published: boolean;
  initial: Omit<PublishSettingsValue, "thumbnailMediaKey" | "topicId"> & {
    thumbnailMediaKey?: string | null;
    topicId?: number | null;
  };
  /** 본문에 들어간 이미지 키(나온 순서). 대표 이미지 후보다. */
  images?: string[];
  /** 이 블로그의 카테고리 트리 */
  categories?: CategoryNode[];
  /** 포털 주제 트리(`GET /topics`). 비어 있으면 "선택 안 함"만 */
  topics?: TopicNode[];
  pending?: boolean;
  /** 발행 실패 문구 */
  error?: string | null;
  onClose: () => void;
  /** 카테고리·태그·주제를 바꿀 때마다(닫아도 고른 값이 작성 화면에 남아 임시저장된다) */
  onClassify?: (value: Pick<PublishSettingsValue, "categoryId" | "tags" | "topicId">) => void;
  onPublish: (value: PublishSettingsValue) => void;
}

/**
 * 발행 설정 레이어(FR-013, FR-107). "완료"를 누르면 열리고, 여기서 발행 버튼을 눌러야만 발행된다.
 * 닫으면 작성 화면으로 돌아가고 글은 임시저장 상태로 남는다(AS8).
 * 공개 범위(공개·비공개), 카테고리(미분류 포함), 포털 주제(003, 카테고리와 따로), 태그, 대표 이미지(본문 이미지 중 선택, 기본은 첫 이미지),
 * 발행 시각(지금), 댓글 허용.
 */
export function PublishSettingsDialog({
  published,
  initial,
  categories = [],
  topics = [],
  images = [],
  pending = false,
  error,
  onClose,
  onClassify,
  onPublish,
}: PublishSettingsDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [commentEnabled, setCommentEnabled] = useState(initial.commentEnabled);
  const [categoryId, setCategoryId] = useState<number | null>(initial.categoryId);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [topicId, setTopicId] = useState<number | null>(initial.topicId ?? null);
  const [thumbnailMediaKey, setThumbnailMediaKey] = useState<string | null>(() =>
    initial.thumbnailMediaKey && images.includes(initial.thumbnailMediaKey)
      ? initial.thumbnailMediaKey
      : (images[0] ?? null),
  );

  const changeCategory = (next: number | null) => {
    setCategoryId(next);
    onClassify?.({ categoryId: next, tags, topicId });
  };
  const changeTags = (next: string[]) => {
    setTags(next);
    onClassify?.({ categoryId, tags: next, topicId });
  };
  const changeTopic = (next: number | null) => {
    setTopicId(next);
    onClassify?.({ categoryId, tags, topicId: next });
  };

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
      <CategorySelect
        categories={categories}
        value={categoryId}
        onChange={changeCategory}
        disabled={pending}
      />
      <TopicSelect topics={topics} value={topicId} onChange={changeTopic} disabled={pending} />
      <TagInput value={tags} onChange={changeTags} disabled={pending} />
      <fieldset className="publish-thumbnail">
        <legend>{t("media:thumbnail.legend")}</legend>
        {images.length === 0 ? (
          <p>{t("media:thumbnail.none")}</p>
        ) : (
          images.map((key, index) => (
            <label key={key}>
              <input
                type="radio"
                name="thumbnailMediaKey"
                value={key}
                checked={thumbnailMediaKey === key}
                onChange={() => setThumbnailMediaKey(key)}
                disabled={pending}
              />
              <img
                {...thumbnailImage(mediaUrl(key), "avatar")}
                alt={t("media:thumbnail.option", { number: index + 1 })}
              />
            </label>
          ))
        )}
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
          onClick={() =>
            onPublish({ visibility, commentEnabled, categoryId, tags, topicId, thumbnailMediaKey })
          }
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
