import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CategoryNode, TopicNode, TrackbackPing, Visibility } from "~/api/models";
import { fieldErrorMessage } from "~/api/errorMessage";
import { CategorySelect } from "~/components/blog/CategoryTree";
import {
  POST_PASSWORD_MAX,
  POST_PASSWORD_MIN,
  ProtectedPasswordField,
  protectedPasswordError,
} from "~/components/post/ProtectedPasswordField";
import { ScheduleField } from "~/components/post/ScheduleField";
import { TagInput } from "~/components/post/TagInput";
import { TopicSelect } from "~/components/post/TopicSelect";
import { PingResultList } from "~/components/trackback/PingResultList";
import {
  TRACKBACK_TARGETS_MAX,
  TrackbackTargetsField,
  parseTrackbackTargets,
} from "~/components/trackback/TrackbackTargetsField";
import { DEFAULT_TIME_ZONE } from "~/i18n/format";
import { localToUtcIso, utcIsoToLocal } from "~/i18n/zonedDateTime";
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
  /** 공지로 등록(004 FR-059) */
  notice: boolean;
  /** 보호 글 비밀번호(004 FR-062). 보호가 아니거나 이미 보호 글에서 비워 두면 undefined(지금 값 유지) */
  password?: string;
  /** 예약 시각(UTC ISO, 004 FR-064). 바로 발행이면 null */
  scheduledAt: string | null;
  /** 트랙백을 보낼 주소(005 FR-052). 공개 글이고 입력이 있을 때만 */
  trackbackUrls?: string[];
}

export interface PublishSettingsDialogProps {
  /** 이미 발행한 글이면 버튼이 "수정 발행"(FR-108) */
  published: boolean;
  initial: Omit<
    PublishSettingsValue,
    "thumbnailMediaKey" | "topicId" | "notice" | "password" | "scheduledAt"
  > & {
    thumbnailMediaKey?: string | null;
    topicId?: number | null;
    notice?: boolean;
    /** 예약 글의 예약 시각(UTC ISO) */
    scheduledAt?: string | null;
  };
  /** 예약 시각을 입력·표시할 회원 시간대 */
  timeZone?: string;
  /** 본문에 들어간 이미지 키(나온 순서). 대표 이미지 후보다. */
  images?: string[];
  /** 이 블로그의 카테고리 트리 */
  categories?: CategoryNode[];
  /** 포털 주제 트리(`GET /topics`). 비어 있으면 "선택 안 함"만 */
  topics?: TopicNode[];
  pending?: boolean;
  /** 발행 실패 문구 */
  error?: string | null;
  /** 이 글이 이미 보낸 트랙백(005, 발행된 글만). 없으면 목록을 그리지 않는다 */
  pings?: TrackbackPing[] | null;
  onClose: () => void;
  /** 카테고리·태그·주제를 바꿀 때마다(닫아도 고른 값이 작성 화면에 남아 임시저장된다) */
  onClassify?: (value: Pick<PublishSettingsValue, "categoryId" | "tags" | "topicId">) => void;
  onPublish: (value: PublishSettingsValue) => void;
}

/**
 * 발행 설정 레이어(FR-013, FR-107). "완료"를 누르면 열리고, 여기서 발행 버튼을 눌러야만 발행된다.
 * 닫으면 작성 화면으로 돌아가고 글은 임시저장 상태로 남는다(AS8).
 * 공개 범위(공개·비공개), 카테고리(미분류 포함), 포털 주제(003, 카테고리와 따로), 태그, 대표 이미지(본문 이미지 중 선택, 기본은 첫 이미지),
 * 발행 시각(지금 또는 예약, 004), 댓글 허용, 공지로 등록(004). 공개 범위 "보호"(004)를 고르면 비밀번호를 받는다
 * (이미 보호 글이면 비워 두면 그대로). 예약은 이미 발행된 글에는 보이지 않는다.
 * 005: "트랙백 보내기"(공개일 때만, 최대 10개)와 이미 보낸 트랙백 결과.
 */
export function PublishSettingsDialog({
  published,
  initial,
  categories = [],
  topics = [],
  images = [],
  timeZone = DEFAULT_TIME_ZONE,
  pending = false,
  error,
  pings,
  onClose,
  onClassify,
  onPublish,
}: PublishSettingsDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [commentEnabled, setCommentEnabled] = useState(initial.commentEnabled);
  const [notice, setNotice] = useState(initial.notice ?? false);
  const [categoryId, setCategoryId] = useState<number | null>(initial.categoryId);
  const [tags, setTags] = useState<string[]>(initial.tags);
  const [topicId, setTopicId] = useState<number | null>(initial.topicId ?? null);
  const wasProtected = initial.visibility === "PROTECTED";
  const [password, setPassword] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(Boolean(initial.scheduledAt));
  const [scheduleLocal, setScheduleLocal] = useState(() =>
    utcIsoToLocal(initial.scheduledAt ?? null, timeZone),
  );
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [trackbackText, setTrackbackText] = useState("");
  const [trackbackError, setTrackbackError] = useState<string | null>(null);
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

  const scheduling = !published && scheduleEnabled;
  let publishLabel = t("post:publish.publishPublic");
  if (published) {
    publishLabel = t("post:publish.republish");
  } else if (scheduling) {
    publishLabel = t("post:publish.schedule");
  } else if (visibility === "PRIVATE") {
    publishLabel = t("post:publish.savePrivate");
  }

  /** 미리 검사하고 발행 값을 넘긴다(비밀번호 길이·예약 시각 형식). 문제가 있으면 그 칸에 알린다. */
  const submit = () => {
    const passwordCode =
      visibility === "PROTECTED" ? protectedPasswordError(password, wasProtected) : null;
    const scheduledAt = scheduling ? localToUtcIso(scheduleLocal, timeZone) : null;
    setPasswordError(
      passwordCode
        ? fieldErrorMessage(t, {
            code: passwordCode,
            params: { min: POST_PASSWORD_MIN, max: POST_PASSWORD_MAX },
          })
        : null,
    );
    setScheduleError(
      scheduling && scheduledAt === null ? fieldErrorMessage(t, { code: "INVALID" }) : null,
    );
    const trackbackUrls = visibility === "PUBLIC" ? parseTrackbackTargets(trackbackText) : [];
    const tooManyTargets = trackbackUrls.length > TRACKBACK_TARGETS_MAX;
    setTrackbackError(
      tooManyTargets
        ? fieldErrorMessage(t, { code: "TOO_LONG", params: { max: TRACKBACK_TARGETS_MAX } })
        : null,
    );
    if (passwordCode || (scheduling && scheduledAt === null) || tooManyTargets) {
      return;
    }
    onPublish({
      visibility,
      commentEnabled,
      categoryId,
      tags,
      topicId,
      thumbnailMediaKey,
      notice,
      ...(visibility === "PROTECTED" && password !== "" ? { password } : {}),
      scheduledAt,
      ...(trackbackUrls.length > 0 ? { trackbackUrls } : {}),
    });
  };

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
        <label>
          <input
            type="radio"
            name="visibility"
            value="PROTECTED"
            checked={visibility === "PROTECTED"}
            onChange={() => setVisibility("PROTECTED")}
          />
          {t("post:publish.protected")}
        </label>
      </fieldset>
      {visibility === "PROTECTED" && (
        <ProtectedPasswordField
          value={password}
          onChange={setPassword}
          keepExisting={wasProtected}
          error={passwordError}
          disabled={pending}
        />
      )}
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
      {published ? (
        <p>
          {t("post:publish.publishTime")}: {t("post:publish.now")}
        </p>
      ) : (
        <ScheduleField
          enabled={scheduleEnabled}
          onEnabledChange={setScheduleEnabled}
          value={scheduleLocal}
          onChange={setScheduleLocal}
          timeZone={timeZone}
          error={scheduleError}
          disabled={pending}
        />
      )}
      <label>
        <input
          type="checkbox"
          name="commentEnabled"
          checked={commentEnabled}
          onChange={(event) => setCommentEnabled(event.target.checked)}
        />
        {t("post:publish.commentEnabled")}
      </label>
      <label>
        <input
          type="checkbox"
          name="notice"
          checked={notice}
          onChange={(event) => setNotice(event.target.checked)}
        />
        {t("post:publish.notice")}
      </label>
      <TrackbackTargetsField
        value={trackbackText}
        onChange={setTrackbackText}
        enabled={visibility === "PUBLIC"}
        error={trackbackError}
        disabled={pending}
      />
      {pings !== undefined && (
        <section className="trackback-ping-results" aria-label={t("trackback:pings.title")}>
          <h3>{t("trackback:pings.title")}</h3>
          <PingResultList pings={pings} />
        </section>
      )}
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose} disabled={pending}>
          {t("post:publish.close")}
        </button>
        <button type="button" onClick={submit} disabled={pending} aria-busy={pending || undefined}>
          {publishLabel}
        </button>
      </div>
      {pending && <p aria-live="polite">{t("post:publish.publishing")}</p>}
    </div>
  );
}
