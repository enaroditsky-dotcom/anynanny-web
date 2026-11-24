export const MARKETING_APP_STORE_BADGE_ALT = "הורדת AnyNanny ב-App Store";
export const MARKETING_PLAY_BADGE_ALT = "הורדת AnyNanny ב-Google Play";

export function MarketingStoreBadges({
  appStoreHref,
  playHref,
  className,
  linkClassName
}: {
  appStoreHref: string;
  playHref: string;
  className?: string;
  linkClassName?: string;
}) {
  return (
    <span className={className}>
      <a
        className={linkClassName}
        href={appStoreHref}
        target="_blank"
        rel="noopener noreferrer"
        data-cta="app-store"
        data-press=""
      >
        <img
          src="/brand/app-store-badge-he.svg"
          alt={MARKETING_APP_STORE_BADGE_ALT}
          width={122}
          height={42}
        />
      </a>
      <a
        className={linkClassName}
        href={playHref}
        target="_blank"
        rel="noopener noreferrer"
        data-cta="google-play"
        data-press=""
      >
        <img
          src="/brand/google-play-badge-en.png"
          alt={MARKETING_PLAY_BADGE_ALT}
          width={646}
          height={250}
        />
      </a>
    </span>
  );
}
