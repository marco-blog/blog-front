import { useId, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { errorMessage } from "~/api/errorMessage";
import { isApiError } from "~/api/errors";
import type { MediaPurpose } from "~/api/models";
import { thumbnailImage, type ThumbnailPreset } from "~/media/thumbnail";
import { ACCEPTED_IMAGE_TYPES, uploadMedia } from "~/media/upload";

export interface ImageUploadFieldProps {
  /**
   * 폼 필드 이름. 이미지를 바꿨을 때만 보낸다: 새로 올린 이미지의 키, 지웠으면 빈 문자열.
   * 보내지 않으면 지금 이미지를 그대로 둔다(PATCH의 생략).
   */
  name: string;
  label: string;
  /** 올릴 때의 용도. backend는 그 용도로 올린 본인 이미지만 프로필·블로그 대표 이미지로 저장한다. */
  purpose: MediaPurpose;
  /** 지금 저장된 이미지(`/media/{key}`) */
  currentUrl: string | null;
  preset: ThumbnailPreset;
  /** 저장할 때 backend가 돌려준 이 필드의 오류 문구 */
  error?: string;
  disabled?: boolean;
}

type Selection =
  { kind: "current" } | { kind: "uploaded"; key: string; url: string } | { kind: "removed" };

/**
 * 프로필 이미지·블로그 대표 이미지 고르기(US4). 파일을 고르면 바로 올려(TEMP) 미리 보여주고,
 * 폼을 저장할 때 그 키를 함께 보내 등록(ATTACHED)한다. 저장하지 않은 이미지는 backend가 TTL 뒤 지운다.
 */
export function ImageUploadField({
  name,
  label,
  purpose,
  currentUrl,
  preset,
  error,
  disabled = false,
}: ImageUploadFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const [selection, setSelection] = useState<Selection>({ kind: "current" });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  let previewUrl: string | null = null;
  if (selection.kind === "uploaded") {
    previewUrl = selection.url;
  } else if (selection.kind === "current") {
    previewUrl = currentUrl;
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadMedia(file, purpose);
      setSelection({ kind: "uploaded", key: uploaded.key, url: uploaded.url });
    } catch (failure) {
      setUploadError(errorMessage(t, isApiError(failure) ? failure : null));
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  return (
    <fieldset className="form-field image-upload">
      <legend>{label}</legend>
      {previewUrl ? (
        <img {...thumbnailImage(previewUrl, preset)} alt={t("media:field.preview", { label })} />
      ) : (
        <p className="image-upload-empty">{t("media:field.empty")}</p>
      )}
      <label htmlFor={inputId}>{t("media:field.choose")}</label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        disabled={disabled || uploading}
        onChange={(event) => void choose(event)}
        aria-invalid={uploadError || error ? true : undefined}
      />
      {previewUrl && (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => {
            setSelection({ kind: "removed" });
            setUploadError(null);
          }}
        >
          {t("media:field.remove")}
        </button>
      )}
      {uploading && <p role="status">{t("media:field.uploading")}</p>}
      {!uploading && selection.kind !== "current" && (
        <p className="form-hint">{t("media:field.saveToApply")}</p>
      )}
      {uploadError && (
        <p role="alert" className="form-error">
          {uploadError}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      {selection.kind === "uploaded" && <input type="hidden" name={name} value={selection.key} />}
      {selection.kind === "removed" && <input type="hidden" name={name} value="" />}
    </fieldset>
  );
}
