# Visitor statistics and a single heart button

LATEST FOUNDER DECISION: Replace the previously proposed feedback form entirely with a clickable heart icon. No questionnaire, rating choices, audience selector, free-text field, email field, or feedback modal. Retain visitor statistics. This document supersedes the prior feedback-form specification.

## Visitor measurement

Use Vercel Web Analytics for estimated visitors, page views, available referral sources and device split. Reuse an existing installation; adding `@vercel/analytics` is permitted if necessary. Keep the integration marketing-scoped, exclude recovery/code URLs and private application routes, and strip query strings/fragments from tracked URLs. Never collect user IDs, emails or auth tokens. Do not count local/testing previews as production traffic.

Document Vercel dashboard enablement as a release setup step; do not claim it has happened. Unique visitors are estimates, and Vercel's visitor hash resets daily. Do not describe totals as a perfectly deduplicated count of individual humans.

Custom analytics events require Pro or Enterprise according to the documentation checked on 10 September 2026. Do not assume that subscription or purchase an upgrade. Optional signup-click/chapter-view events may remain behind a disabled configuration flag. Signup clicks are not completed registrations. Heart counting below must work independently of paid analytics events.

## The entire visitor feedback experience

Place one simple heart icon near the closing invitation, with enough space to notice it naturally. Outline by default, filled in the brand's warm coral after a confirmed successful click. Use a real button, accessible Hebrew name `אהבתי את AnyNanny`, `aria-pressed`, visible keyboard focus, and a touch target of at least 44 by 44 px. A brief restrained fill animation is acceptable; respect reduced motion.

Do not open a dialog or ask the visitor to type anything. Do not require login. Do not add public ratings or a public likes counter. The founder sees aggregate counts privately.

One successful like per browser token for this site. Keep the filled state on return visits. This is a simple one-way like; repeated clicks do not add likes or toggle unlike. Do not describe this as one verified human per like: clearing browser storage or using another device can allow another token.

Send the save request once while pending. Fill permanently only after the server confirms the save, or roll back any optimistic fill on failure. On failure, keep the button usable and announce `לא הצלחנו לשמור את הלב. נסו שוב.` accessibly. On success announce `תודה על הלב!`. No popup, form or confetti.

## Durable count visible to the founder

Use the existing server-side Supabase conventions. Prepare a narrowly scoped endpoint and a separately reviewable migration for a private likes table. Minimal data: a server-side hashed random browser token and creation timestamp, with a unique constraint on the token hash. Generate a cryptographically random first-party browser token solely for deduplication; do not link it to authentication, private profiles, browsing history or analytics identities. Store no names, emails or raw IPs in the likes table.

Use a server-controlled insert path, RLS and restricted privileges; ordinary users must not be able to list or alter other likes. Elevated credentials remain server-only. A unique constraint plus idempotent insert must prevent duplicates under retries and concurrent requests; a localStorage flag alone is insufficient. Validate token format and request size, and reuse existing request-abuse controls where available. Do not introduce a new external service just for this button or claim it is fraud-proof.

Eddie can initially see the total and date breakdown through his existing authorized Supabase dashboard. Include a simple aggregate query/read instruction for him; a new admin UI is unnecessary. Keep likes and visitor statistics distinct because their deduplication methods differ; a ratio is only an indicative engagement measure.

Prepare the migration but do not apply it remotely or write test likes to production. Test valid saves, duplicates, concurrent/retried submissions, malformed input and backend failures locally where possible. If real database checks cannot run, state the unverified part accurately. Until persistence is configured for release, do not expose a live-looking button that silently discards likes. The local implementation must be concrete and reviewable with explicit test configuration.

## Scope and release handoff

Retain the support mailto link as a separate contact option. Do not implement the rejected feedback form or its table/endpoint. If any draft form code exists, remove only the newly added unapproved form implementation; preserve unrelated existing product feedback/reporting features and charter text.

Report separately what code is implemented, what was tested, and what requires Vercel enablement or the prepared database migration/configuration. Describe actual analytics and first-party browser-token storage so the existing privacy notice can be kept accurate. No paid-service activation, commits, pushes, remote migrations or deployment in this task.

References:
- https://vercel.com/docs/analytics
- https://vercel.com/docs/analytics/custom-events
- https://vercel.com/docs/analytics/quickstart
