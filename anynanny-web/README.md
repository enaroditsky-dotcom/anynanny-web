# AnyNanny Web (Next.js + Tailwind)

Mobile-responsive web MVP scaffold for:
- Dual landing experience (Parents / Sitters)
- Secure authentication integration
- HYP-based identity verification and payments
- City/address-based matching

## Structure

- `app/` - App Router pages and route groups
- `components/` - Shared UI building blocks
- `features/` - Domain-focused feature modules
- `lib/` - Utilities, API clients, auth adapters
- `types/` - Shared app types
- `public/` - Static assets

## Color Direction

- Navy primary: `#123A6F`
- Navy dark: `#0D2B52`
- Accent: `#2A5DBC`
- Neutral bg: `#F4F7FC`

## Advertising Infrastructure — Ad Ready

The public website is prepared for future advertising without showing ads now.

- First-party ad slot infrastructure is in place (`components/marketing/ad-slot.tsx`).
- Placement IDs live in `lib/marketing/ad-slots.ts` and are **disabled by default**.
- Activation is deferred until meaningful traffic exists.
- No ad network, pixel, cookie, or tracking integration is connected.

Future possibilities, after traffic and a privacy review:

- Direct sponsorships
- Family-oriented advertisers
- Sponsored Marketplace placements
- Ad networks, if appropriate later

See `docs/advertising-infrastructure.md` for placement IDs, allowed surfaces, and advertising rules.

## Next Step

Install dependencies and run:

1. `npm install`
2. `npm run dev`
