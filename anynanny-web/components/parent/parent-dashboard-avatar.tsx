"use client";

import { User } from "lucide-react";
import { ProfileImage } from "@/components/profile/profile-image";
import { ParentDashboardVerifiedBadge } from "@/components/parent/parent-dashboard-verified-badge";

type ParentDashboardAvatarProps = {
  src: string | null;
  name: string;
  userId: string | null;
};

/** Circular parent photo. The verified badge hangs on the lower rim and only renders when verified. */
export function ParentDashboardAvatar({ src, name, userId }: ParentDashboardAvatarProps) {
  return (
    <div
      className="relative shrink-0"
      style={{
        width: "clamp(110px, 34vw, 140px)",
        height: "clamp(110px, 34vw, 140px)"
      }}
    >
      <div className="h-full w-full overflow-hidden rounded-full border-[3px] border-white bg-white shadow-[0_12px_24px_-14px_rgba(0,31,63,0.55)]">
        <ProfileImage
          src={src}
          name={name}
          className="h-full w-full rounded-full bg-[#FFF6EC] text-[#001F3F]/40"
          fallback={<User className="h-10 w-10" aria-hidden />}
        />
      </div>
      <ParentDashboardVerifiedBadge userId={userId} />
    </div>
  );
}
