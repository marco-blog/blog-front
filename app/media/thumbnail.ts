/**
 * 썸네일 주소 도우미(FR-130, contracts/api.md "이미지"). backend는 허용 목록의 크기만 만들어 주므로
 * 화면은 아래 용도별 크기만 쓴다. 고해상도 화면용 2배 크기(`srcset`)도 허용 목록에 있다.
 */

/** 이 서비스가 올린 이미지의 원본 주소(`/media/{key}`, key는 base62 22자) */
const MEDIA_URL = /^\/media\/([0-9A-Za-z]{22})$/;

/** 본문 Markdown·HTML 안의 이미지 주소. 뒤에 썸네일 크기가 붙은 주소도 원본 키로 본다. */
const MEDIA_REFERENCE = /\/media\/([0-9A-Za-z]{22})(?![0-9A-Za-z])/g;

export type ThumbnailFit = "cover" | "contain";

export interface ThumbnailSize {
  width: number;
  height: number;
}

/** 화면별 크기. 모두 backend `blog.media.thumbnail.sizes`에 있고, 2배 크기도 있다. */
export const THUMBNAIL_SIZES = {
  /** 글 목록 카드 */
  card: { width: 300, height: 200 },
  /** 블로그 홈 대표 이미지, 발행 설정의 큰 미리보기 */
  cover: { width: 600, height: 400 },
  /** 댓글·글 작성자 프로필 */
  avatarSmall: { width: 50, height: 50 },
  /** 블로그 홈·설정의 프로필, 발행 설정의 대표 이미지 후보 */
  avatar: { width: 100, height: 100 },
  /** og:image */
  og: { width: 1200, height: 630 },
} as const satisfies Record<string, ThumbnailSize>;

export type ThumbnailPreset = keyof typeof THUMBNAIL_SIZES;

/** `/media/{key}`의 key. 이 서비스의 이미지 주소가 아니면 null */
export function mediaKeyOf(url: string | null | undefined): string | null {
  return url ? (MEDIA_URL.exec(url)?.[1] ?? null) : null;
}

/** 본문에 들어간 이 서비스 이미지의 키(나온 순서, 중복 없이) */
export function mediaKeysIn(content: string | null | undefined): string[] {
  const keys = new Set<string>();
  for (const match of (content ?? "").matchAll(MEDIA_REFERENCE)) {
    keys.add(match[1]);
  }
  return [...keys];
}

export function mediaUrl(key: string): string {
  return `/media/${key}`;
}

/**
 * 썸네일 주소 `/media/{key}/{w}x{h}`(`fit` 기본값 cover는 생략). 이 서비스의 이미지가 아니면 원래 주소를 그대로 준다.
 */
export function thumbnailUrl(
  url: string,
  size: ThumbnailSize,
  fit: ThumbnailFit = "cover",
): string {
  if (!mediaKeyOf(url)) {
    return url;
  }
  return `${url}/${size.width}x${size.height}${fit === "contain" ? "?fit=contain" : ""}`;
}

export interface ThumbnailImage {
  src: string;
  /** 2배 크기. 이 서비스의 이미지가 아니면 없다. */
  srcSet?: string;
  width: number;
  height: number;
}

/** `<img>`에 그대로 펼쳐 넣는 속성(src, 2배 srcSet, 가로·세로). */
export function thumbnailImage(
  url: string,
  preset: ThumbnailPreset,
  fit: ThumbnailFit = "cover",
): ThumbnailImage {
  const size = THUMBNAIL_SIZES[preset];
  const src = thumbnailUrl(url, size, fit);
  if (src === url) {
    return { src, width: size.width, height: size.height };
  }
  const double = thumbnailUrl(url, { width: size.width * 2, height: size.height * 2 }, fit);
  return { src, srcSet: `${src} 1x, ${double} 2x`, width: size.width, height: size.height };
}

/** og:image용 1200x630 주소(상대 주소). 이미지가 없으면 null */
export function ogImageUrl(url: string | null | undefined): string | null {
  return url ? thumbnailUrl(url, THUMBNAIL_SIZES.og) : null;
}
