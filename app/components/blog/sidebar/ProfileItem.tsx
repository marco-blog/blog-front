import { useTranslation } from "react-i18next";

import { Avatar } from "~/components/media/Avatar";

import { SidebarSection } from "./SidebarSection";

export interface ProfileItemProps {
  description: string | null;
  owner: { nickname: string; profileImageUrl: string | null; bio: string | null };
}

/** 프로필: 주인 프로필 사진·닉네임·소개와 블로그 소개 */
export function ProfileItem({ description, owner }: ProfileItemProps) {
  const { t } = useTranslation();
  return (
    <SidebarSection type="PROFILE" title={t("blog:sidebar.PROFILE")}>
      <p className="sidebar-profile-owner">
        <Avatar url={owner.profileImageUrl} size="avatar" /> <strong>{owner.nickname}</strong>
      </p>
      {owner.bio && <p className="sidebar-profile-bio">{owner.bio}</p>}
      {description && <p className="sidebar-profile-description">{description}</p>}
    </SidebarSection>
  );
}
