# AnyNanny Web (Next.js + Tailwind)

Mobile-responsive web MVP scaffold for:
- Dual landing experience (Parents / Sitters)
- Secure authentication integration (Clerk or Firebase)
- Sitter verification upload UI
- Gett ride-order mock interaction

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

## Next Step

Install dependencies and run:

1. `npm install`
2. `npm run dev`

## Stripe (Checkout + webhooks)

1. Apply migration `supabase/migrations/20260520120000_bookings_payment_sessions_booking.sql` (adds `bookings.payment_status`, `paid_at`, `stripe_checkout_session_id`, and `sessions.booking_id`).
2. In Stripe Dashboard → Developers → Webhooks, add endpoint `https://<your-host>/api/stripe/webhook` and subscribe to `checkout.session.completed`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
4. Copy `anynanny-web/.env.example` into `anynanny-web/.env.local` and fill values (see list in repo or docs).
