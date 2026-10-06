import { api, type BrowserApi } from "~/api/client";
import { ApiError } from "~/api/errors";
import type { MediaPurpose, MediaUpload } from "~/api/models";

/** backend `blog.media.max-size` 기본값(10MB). 이보다 크면 보내지 않고 같은 오류(413)로 알린다. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** 고를 수 있는 형식(backend `blog.media.allowed-types`). 실제 내용 검사는 backend가 한다. */
export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";

/**
 * 이미지 올리기(`POST /api/v1/media`, multipart `file`·`purpose`). 브라우저에서 같은 출처로 보내고
 * front 서버는 본문을 그대로 backend로 흘려보낸다(server/middleware/backend-proxy.ts).
 * 올린 이미지는 임시(TEMP) 상태이고, 글·프로필·블로그 설정을 저장할 때 등록된다(FR-071).
 * 실패는 ApiError(`MEDIA_TOO_LARGE` 413, `MEDIA_TYPE_NOT_ALLOWED` 415, `MEDIA_TEMP_QUOTA_EXCEEDED` 429 등)로 던진다.
 */
export async function uploadMedia(
  file: File,
  purpose: MediaPurpose = "POST",
  client: BrowserApi = api,
): Promise<MediaUpload> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError({ status: 413, resultCode: "MEDIA_TOO_LARGE" });
  }
  const body = new FormData();
  body.append("file", file, file.name);
  body.append("purpose", purpose);
  return client.post<MediaUpload>("/media", { body });
}
