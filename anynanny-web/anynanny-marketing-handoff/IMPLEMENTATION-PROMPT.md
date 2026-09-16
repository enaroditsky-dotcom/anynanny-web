# AnyNanny marketing homepage — implementation instructions

Implement the approved Hebrew storytelling homepage in the existing AnyNanny Next.js project. This is the implementation phase, following the read-only inspection. Complete the page and local verification; do not stop after another plan.

## Inputs and scope

The folder `anynanny-marketing-handoff/` is supplied inside the Next.js project directory, beside its `package.json`.

Read these files before implementing:
- `approved-copy.he.md`: authoritative Hebrew copy, including both complete charters and Eddie's two wording corrections.
- `ASSETS.md`: exact asset mapping, Hebrew alt text/captions, and placement guidance.
- `reference/typography-reference.png`: visual reference only; the actual font family is not verified.
- `FEEDBACK-ANALYTICS.md`: the founder's latest request for visitor statistics and a single clickable heart icon. Feedback forms were explicitly rejected. Follow its scoped implementation instructions; it permits the analytics dependency and preparation of a private durable like counter. Do not activate paid services or apply remote migrations.

If the current workspace is the parent worktree, first locate the existing `anynanny-web/package.json`. All application paths below are relative to that Next.js directory. Do not create another nested app.

Read applicable repository instructions. The prior inspection found no AGENTS.md or Cursor rules, but respect any now present. Inspect the current git state and preserve all existing work, including the unrelated untracked parent-level `play-twa/` directory. If still on the clean inspected branch `parent-tour-web-updates`, create a local feature branch named `marketing-story-homepage` without resetting or stashing anything. If already on an appropriate feature branch, continue there. Do not commit, push, deploy, or change hosting settings.

## Confirmed architecture

- Next.js App Router, React, TypeScript, Tailwind; npm.
- `app/page.tsx` currently owns the root landing, auth recovery/code handling, manual-entry query, active-role redirects, signup/login CTAs, and welcome video.
- `app/layout.tsx` applies Varela Round and wraps AuthProvider/AppShellGate.
- `components/app-shell-gate.tsx` already makes `/` chromeless.
- Middleware handles root recovery requests and session refresh.
- Existing `AnyNannyLogo` renders the canonical `public/brand/anynanny-official-wordmark.png`.
- Existing `HomepageWelcomeVideo` uses `public/welcome/anynanny-welcome.mp4`.

Verify relevant details in the current files, then make the smallest focused change. Prefer `components/marketing/` and a scoped CSS module for the new page. Use existing dependencies; do not install a design framework or animation package.

## Product decisions already resolved

1. The new story replaces the old landing UI at `/`.
2. Preserve existing recovery/code handling, parameter forwarding, ordering, and auth behavior. These must execute before ordinary role navigation just as required by the current flow. Do not casually rewrite the auth logic while replacing the JSX.
3. Preserve the existing `active_role` dashboard/onboarding redirect behavior. Preserve the exact `?manual=true` bypass and `ACCOUNT_TYPE_ENTRY_HREF` behavior. Thus anonymous visitors see the story at `/`, and signed-in visitors can deliberately view it at `/?manual=true`. Do not add an unrequested route or redirect policy.
4. Web login/signup remain permanently accessible. Reuse the current verified handlers/helpers, including role/track construction through the existing signup flow. Do not guess track values or use the obsolete `/auth/sign-in` scaffold.
5. Keep the existing 10-second welcome video, using the existing component and controls where suitable. Place it near the end of the introduction, so it supports the story. Do not autoplay audio. Do not invent more videos or a founder photo.
6. Scope `dir="rtl"` and typography to the marketing page. Do not change the global HTML direction or global application font.
7. Use the existing support constant from `lib/legal/contact.ts` and a mailto link. No contact API is available. For visitor feedback, implement only the heart button described in `FEEDBACK-ANALYTICS.md`. Do not build any feedback form.
8. No app-store URLs exist. Display the approved coming-soon text as plain, noninteractive text until real URLs are supplied.
9. Both charters appear as readable expandable content within the story, using the supplied exact text. This is informational reading, not a new acceptance flow. Do not modify `lib/charter/versions.ts`, consent records, legal routes, or the existing charter acceptance process.

## Editorial direction: a continuous human story

The previous mechanical feature-grid concept was explicitly rejected. Build a flowing, intimate narrative with room to read and breathe. No numbered feature sections, dashboard aesthetic, repeated boxed paragraphs, generic SaaS template, floating metrics, fake testimonials, or invented community counts.

Use every approved paragraph in its approved order. Do not rewrite, shorten, or substitute the copy. Presentation-only line breaks, emphasis, and semantic heading levels may change without altering words. Only the two charters collapse by default; the main story remains readable in the page.

Chapter navigation labels and stable IDs:

| Navigation label | ID | Approved content |
|---|---|---|
| פתיחה | home | Logo, slogan, opening paragraphs |
| מה זה AnyNanny? | about | Introduction |
| הסיפור שלי | founder | Eddie's full personal story |
| הקהילה שלנו | community | Who it is for / new babysitting culture |
| להורים | parents | Parent benefits, including NOW |
| לבייביסיטריות | sitters | Sitter benefits |
| הצצה לאפליקציה | app | Practical examples and approved demo earnings |
| כבוד וביטחון | respect | Mutual trust, full charters, feedback/reporting |
| נעים להכיר | profile | Profile details and special dates |
| גדלים יחד | together | Growing together, founder sign-off and join actions |

The short navigation labels do not replace the longer approved chapter headings. Match the sections in `approved-copy.he.md`; do not publish this mapping table as page content.

## Visual design

- Hero: centered official wordmark at its native aspect ratio, the slogan `פשוט למצוא זמן לחיים`, and the exact opening paragraphs. Follow with a gentle in-page invitation linking to the introduction. Preserve a clear route to signup/login in the header.
- Colors: cream `#FDFBF6`, navy `#001F3F`, muted teal `#165b73`, green/turquoise accents grounded in existing brand assets. Alternate only a few pale surfaces with subtle transitions.
- Main paragraphs live in a centered reading column of roughly 640–720 px, right-aligned. Media compositions may extend to roughly 1040–1120 px. Avoid stretching text across the whole screen.
- Provisional marketing-only font: `Arial, "Segoe UI", sans-serif`, normal paragraph weight and real bold emphasis. This is an explicit temporary choice while the reference font is unverified, not a claim of an exact match. Keep it in one scoped variable so it can be replaced once identified. Preserve Varela Round everywhere else.
- Body text roughly 19–21 px desktop, 17–18 px mobile, line height about 1.75–1.9. Responsive headings, typically 30–44 px; hero slogan can be larger. Check actual Hebrew wrapping rather than forcing these numbers.
- Use generous but proportional chapter spacing, around 80–112 px desktop and 48–64 px mobile. Never force every chapter to a screen height. Long chapters should read naturally.
- Distinguish chapters through typography, spacing, occasional editorial split layouts, and relevant imagery rather than putting every chapter into a card.
- Reuse the genuine mascot sparingly. Its JPEG has a white matte: compose it on a suitable light surface and do not pretend it is transparent. Do not create synthetic family portraits or a substitute founder portrait.
- The founder chapter is complete as a text-led personal story with a tasteful name/signature treatment. Absence of a photo must not create an empty box or visible placeholder.
- Hero logo and identity are the visual focus. Screenshots belong where the story refers to the app; do not stack phones behind the hero heading or overload the introduction.
- Avoid prominent shadows, excessive pills, gradients on every element, decorative counters, and constant motion. Text contrast and comfortable reading take priority.

## Navigation: center the chosen chapter

Implement a dedicated marketing header, not AppShellHeader. Keep all chapter destinations reachable plus permanent login/signup.

Use a compact desktop arrangement if all labels fit; otherwise switch to an accessible chapter menu before text collides. Mobile uses a menu button, a visible account-entry action, and a clear active-chapter indication. Do not show a tiny unreadable row of ten links.

When a chapter link is activated:
1. Close the mobile menu before measuring.
2. Measure the actual persistent header height H and viewport height V after the layout settles.
3. The usable viewport is U = V - H.
4. For a chapter content wrapper of height C that fits within U minus comfortable margins, target its vertical center: `scrollY + rect.top - H - (U - C) / 2`.
5. For a longer chapter, target its heading/opening: `scrollY + headingRect.top - H - gap`, using a modest responsive gap.
6. Clamp the target to the document scroll limits. Measure an inner content wrapper, excluding oversized decorative chapter padding.

Use smooth scrolling only when reduced motion is not requested. Plain hash links and scroll-margin must provide a useful fallback. Do not use mandatory CSS scroll snapping or intercept the user's wheel/touch scrolling.

Account for initial deep links, browser Back/Forward, refreshed hash URLs, header size changes, and reserved media dimensions. Do not repeatedly recenter while the user reads or manually scrolls. Opening a charter does not hijack scroll. Keep mobile-menu controls keyboard-accessible, with expanded state, Escape handling and sensible focus return. Hash updates should not trap Back with scroll-spy entries. The active-chapter observer updates highlighting with `aria-current="location"` and does not steal focus.

## Assets and interaction

Copy only assets selected for the page from the handoff into `public/marketing/`, keeping their descriptive names. Do not move or delete the handoff originals.

Use `ASSETS.md` to place the actual supplied images. Preserve aspect ratios and reserve intrinsic dimensions. Lazy-load below-fold images; keep the official wordmark immediately available. In galleries, display no more than two portraits side by side on desktop, one on mobile, with manual controls. A simple accessible enlarge action can show a readable full screenshot; support keyboard dismissal and focus return. No automatic carousel.

Always show a visible caption that screenshots are illustrative: `מסכים להמחשה`. For the generated wallet/history/NOW-results demos, additionally show `נתונים לדוגמה` adjacent to the image, including enlarged views. Preserve the labels already inside the approved images. Never present demo earnings or profiles as live platform statistics, real testimonials, or guaranteed income. Wallet/history figures are exactly five shifts, fifteen hours, and 900 NIS at 60 NIS/hour.

Screenshot buttons are pixels, not working app controls. Clicking the outer image enlarges it only. The marketing page must not send shift requests or perform payment actions.

Keep the welcome video playable with controls and existing caption support if present. Inspect available subtitle tracks; do not claim subtitles exist if they do not. Do not fabricate a transcript from this brief. Treat adding accurate Hebrew subtitles as a specific remaining media task if none exists.

Respect both existing privacy behavior and the approved wording. Do not add 100% privacy/safety guarantees, universal verification claims, payment processing via HYP, or an automatic first-responder NOW assignment.

## Footer, performance, and accessibility

- Use `/privacy`, `/terms`, `/delete-account`, the in-page charters anchor, and the verified support mailto destination.
- Do not add unrelated FAQ content or replace the approved closing narrative with a sales grid.
- Semantic main/sections/headings, one main H1, descriptive Hebrew alt text, keyboard access, visible focus, sufficient contrast and reduced-motion support.
- Normal keyboard and assistive-technology navigation must work even if animations fail. Content is visible by default; reveal effects may enhance it without causing blank sections.
- Avoid layout shifts and unnecessary initial video/image downloads. Reuse the existing Next image facilities where appropriate without changing canonical brand behavior unnecessarily.
- Add homepage-specific metadata using the compatible existing architecture. Do not export server metadata from a client component. Do not refactor authentication purely to add metadata, and do not inject marketing metadata into every app route. Preserve existing canonical configuration rather than inventing domains.

## Verification and delivery

Run the existing homepage welcome-video check and the relevant existing auth/recovery/manual-entry checks identified in this repo. The homepage test may need updates because its assertions target the old JSX location; preserve its meaningful expectations for the official wordmark, exact slogan and playable welcome video. Do not delete or weaken unrelated checks simply to pass.

Run the production build if the environment allows. The inspected `lint` script uses `next lint` and may be unsupported; use the current available focused checks and report a tooling issue instead of changing the project's lint setup as part of this task. Never print environment secrets.

Inspect the actual page locally at desktop and mobile widths if browser tooling is available. Check for overflow, logo distortion, unreadable screenshots, heading overlap, and all navigation links. Specifically verify short-section centering, long-section start placement, reduced motion, both charter expansions, and auth entry points. Use `/?manual=true` for signed-in visual inspection. Avoid sending support emails or triggering real bookings/payments. If browser inspection cannot run, say so clearly and provide the exact local URL for Eddie to review; never claim a visual pass without viewing it.

Deliver:
- The working implementation and a concise list of changed files.
- Local preview URL and commands actually used.
- Verification outcomes and any specific remaining limits.
- A note that exact font identification, a genuine founder photo, and any additional videos remain optional follow-up media work, not fabricated completed assets.

Do not publish or push. Stop once the local page is complete and reviewable.
