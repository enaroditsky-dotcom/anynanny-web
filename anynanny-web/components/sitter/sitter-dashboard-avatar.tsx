"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { ProfileImage } from "@/components/profile/profile-image";
import { ParentDashboardVerifiedBadge } from "@/components/parent/parent-dashboard-verified-badge";
import { SITTER_BOOST_CHECKPOINT_COUNT, SITTER_PROFILE_BOOST_HREF } from "@/lib/sitter/profile-boost-progress";

type SitterDashboardAvatarProps = {
  src: string | null;
  name: string;
  userId: string | null;
  completed?: number;
  ready?: boolean;
};

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** Circular sitter photo with a completion ring. The verified badge still hangs on the lower rim. */
export function SitterDashboardAvatar({
  src,
  name,
  userId,
  completed = 0,
  ready = false
}: SitterDashboardAvatarProps) {
  const shown = ready ? Math.max(0, Math.min(SITTER_BOOST_CHECKPOINT_COUNT, completed)) : 0;
  const percent = (shown / SITTER_BOOST_CHECKPOINT_COUNT) * 100;
  const label = ready
    ? `התקדמות הפרופיל, ${shown} מתוך ${SITTER_BOOST_CHECKPOINT_COUNT} הושלמו`
    : "התקדמות הפרופיל";

  return (
    <div
      className="relative shrink-0"
      style={{
        width: "clamp(92px, 28vw, 108px)",
        height: "clamp(92px, 28vw, 108px)"
      }}
    >
      <Link
        href={SITTER_PROFILE_BOOST_HREF}
        aria-label={label}
        className="relative block h-full w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E9F6E] focus-visible:ring-offset-2"
      >
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="#E6EEE9" strokeWidth="3.5" />
          {percent > 0 ? (
            <circle
              cx="50"
              cy="50"
              r={RING_RADIUS}
              fill="none"
              stroke="#0E9F6E"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={RING_CIRCUMFERENCE * (1 - percent / 100)}
              transform="rotate(-90 50 50)"
            />
          ) : null}
        </svg>
        <div className="absolute inset-[5px] overflow-hidden rounded-full bg-white shadow-[0_12px_24px_-14px_rgba(0,31,63,0.55)]">
          <ProfileImage
            src={src}
            name={name}
            className="h-full w-full rounded-full bg-[#E7F3FF] text-[#001F3F]/40"
            fallback={<User className="h-10 w-10" aria-hidden />}
          />
        </div>
      </Link>
      <ParentDashboardVerifiedBadge userId={userId} role="sitter" />
    </div>
  );
}
