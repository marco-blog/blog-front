import { thumbnailImage } from "~/media/thumbnail";

export interface AvatarProps {
  /** 프로필 이미지(`/media/{key}`). 없으면 아무것도 그리지 않는다. */
  url: string | null | undefined;
  size?: "avatarSmall" | "avatar";
}

/** 프로필 이미지 썸네일(이름은 옆에 글자로 있으므로 alt는 비운다). */
export function Avatar({ url, size = "avatarSmall" }: AvatarProps) {
  if (!url) {
    return null;
  }
  return <img {...thumbnailImage(url, size)} alt="" loading="lazy" className="avatar" />;
}
