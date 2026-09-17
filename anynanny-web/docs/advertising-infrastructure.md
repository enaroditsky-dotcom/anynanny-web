# Advertising Infrastructure — Ad Ready

AnyNanny’s public website is prepared for future advertising without showing
ads today. This is infrastructure only: no ad network is connected, no
tracking is installed, and every placement is disabled by default.

Activation is deferred until meaningful traffic exists.

## Current status

- Reusable first-party `AdSlot` mounts exist for future public surfaces.
- A central registry in `lib/marketing/ad-slots.ts` lists every placement ID.
- The advertising master switch is **off**.
- Every placement `enabled` flag is **false**.
- Disabled slots render nothing: no empty box, no reserved height, no layout shift.
- Dimensions are reserved only after a slot is actually enabled.
- No Google AdSense, Google Ad Manager, Meta Pixel, advertiser cookies,
  tracking pixels, or external ad scripts are included.

## Placement IDs

| ID | Future surface |
| --- | --- |
| `knowledge_article_inline` | Knowledge / article pages (in-article) |
| `knowledge_article_bottom` | Knowledge / article pages (end of article) |
| `community_sponsor` | Community areas |
| `marketplace_sponsored` | AnyNanny Marketplace |
| `marketing_story_interstitial` | In-flow transition between marketing story sections |
| `faq_sponsor` | FAQ |

## Surfaces that may support ads later

- Knowledge / article pages
- FAQ
- Community areas
- AnyNanny Marketplace
- Selected transitions between marketing content sections

## Surfaces that must never host ads

- Login
- Registration
- Onboarding
- Booking
- Payments
- Identity verification
- Safety / reporting flows

AnyNanny.app remains product-first and visually clean.

## Advertising rules

- Sponsored content must always be clearly labeled.
- Ads must never look like nanny profiles, user reviews, safety guidance, or AnyNanny editorial recommendations.
- No intrusive popups.
- No autoplay advertising.
- No full-screen interstitials. The `marketing_story_interstitial` placement is an in-flow section break only.
- Mobile usability must be preserved.
- Page performance and Core Web Vitals must be protected.
- Future personalized advertising or tracking must require a separate privacy/consent review before activation.

## How to enable a placement later

1. Confirm traffic, brand fit, and a completed privacy/consent review if any tracking or personalization is involved.
2. Set `ADVERTISING_MASTER_ENABLED` to `true` in `lib/marketing/ad-slots.ts`.
3. Set `enabled: true` on the specific placement(s) in `AD_SLOT_REGISTRY`.
4. Supply first-party creative through `AdSlot` children. Do not add third-party ad scripts until a dedicated integration review.

## Future possibilities

When traffic and policy allow, AnyNanny may consider:

- Direct sponsorships
- Family-oriented advertisers
- Sponsored Marketplace placements
- Ad networks, if appropriate later and after a privacy review
