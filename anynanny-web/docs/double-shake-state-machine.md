# Double-Shake Session State Machine

> Architectural specification for the 11-step Double-Shake parent ⇄ sitter shift
> protocol, backed by a single Postgres enum (`public.session_status`) and a
> single mutable row in `public.sessions` per booking.

This document defines the **only legal** state transitions, the **field
mutations** that accompany each transition, and the **table contract** that the
parent and sitter dashboards both read from via Supabase realtime.

It is deliberately authoritative: any UI branch, RPC, or webhook that needs to
move a session forward MUST use the transitions defined here and MUST NOT write
`status` out-of-band.

---

## 1. Enum Definition

```sql
create type public.session_status as enum (
  'requested',
  'confirmed',
  'sitter_arrived',
  'in_progress',
  'sitter_completed',
  'completed',
  'payment_pending',
  'paid'
);
```

Adding any new state requires a migration **and** an update to the transition
matrix in §3. There is no `cancelled` / `expired` terminal in this enum on
purpose — cancellation is modeled by `bookings.status`, which sits one layer
above the session. A row in `sessions` only exists once a booking has been
`confirmed`.

---

## 2. State Catalog

| # | State              | Trigger Actor | Step(s) | Terminal? |
|---|--------------------|---------------|---------|-----------|
| 1 | `requested`        | Parent        | 1–2     | No        |
| 2 | `confirmed`        | Sitter        | 3       | No        |
| 3 | `sitter_arrived`   | Sitter        | 4       | No        |
| 4 | `in_progress`      | Parent        | 5–6     | No        |
| 5 | `sitter_completed` | Sitter        | 7       | No        |
| 6 | `completed`        | Parent        | 8–9     | No        |
| 7 | `payment_pending`  | System        | 10      | No        |
| 8 | `paid`             | Webhook       | 11      | **Yes**   |

A session is **immutable** once `status = 'paid'`. Any further effect (rating,
dispute, refund) lives in a sibling table, not in `sessions`.

---

## 3. Transition Matrix

The matrix below is the source of truth. Each cell answers: *“who is allowed to
move from row→column, and under what guard?”*

| from \ to            | requested | confirmed | sitter_arrived | in_progress | sitter_completed | completed | payment_pending | paid |
|----------------------|:---------:|:---------:|:--------------:|:-----------:|:----------------:|:---------:|:---------------:|:----:|
| **requested**        | —         | sitter    | —              | —           | —                | —         | —               | —    |
| **confirmed**        | —         | —         | sitter¹        | —           | —                | —         | —               | —    |
| **sitter_arrived**   | —         | —         | —              | parent²     | —                | —         | —               | —    |
| **in_progress**      | —         | —         | —              | —           | sitter           | —         | —               | —    |
| **sitter_completed** | —         | —         | —              | —           | —                | parent    | —               | —    |
| **completed**        | —         | —         | —              | —           | —                | —         | system³         | —    |
| **payment_pending**  | —         | —         | —              | —           | —                | —         | —               | webhook⁴ |
| **paid**             | —         | —         | —              | —           | —                | —         | —               | —    |

Footnotes:

1. **sitter¹** — only inside the 10-minute activation window opened by
   `confirmed_at`. See §4.3.
2. **parent²** — only inside the 10-minute window opened by `sitter_arrived_at`;
   the parent action seals both counters' shared `started_at`.
3. **system³** — server action that creates the Stripe Checkout session.
4. **webhook⁴** — Stripe `checkout.session.completed` (or
   `payment_intent.succeeded`) only, and only when the signature is verified
   and the `stripe_checkout_session_id` matches.

Any update to `status` that is not in this matrix MUST be rejected by the
database (see CHECK constraint in §5).

---

## 4. Per-State Specification

For each state we define: **entry trigger**, **field mutations**, **UI effect
on parent / sitter**, and **exit conditions**.

### 4.1 `requested` — Step 1–2

- **Entry trigger:** Parent submits booking request and a `sessions` row is
  inserted with `status = 'requested'`.
- **Field mutations:**
  - `id` = `gen_random_uuid()`
  - `booking_id`, `parent_id`, `sitter_id`, `hourly_rate_minor` = from booking
  - `requested_at` = `now()`
  - all other `*_at` columns NULL
- **Parent UI:** “Awaiting sitter approval” notice; no Double-Shake circle.
- **Sitter UI:** Approve / Decline card in inbox.
- **Exit:** sitter approves → `confirmed`.

### 4.2 `confirmed` — Step 3

- **Entry trigger:** Sitter approves the request.
- **Field mutations:**
  - `status` ← `'confirmed'`
  - `confirmed_at` ← `now()`
  - `activation_window_expires_at` ← `confirmed_at + interval '10 minutes'`
- **Parent UI:** “Approved — waiting for sitter to arrive.” Double-Shake idle
  circle armed but inert until `sitter_arrived`.
- **Sitter UI:** “Arrived” Double-Shake button armed; disabled when
  `now() > activation_window_expires_at`.
- **Exit:** sitter taps Arrived inside the window → `sitter_arrived`.

### 4.3 `sitter_arrived` — Step 4

- **Entry trigger:** Sitter Double-Shake → “Arrived”.
- **Guard:** `now() <= activation_window_expires_at`.
- **Field mutations:**
  - `status` ← `'sitter_arrived'`
  - `sitter_arrived_at` ← `now()`
  - `activation_window_expires_at` ← `sitter_arrived_at + interval '10 minutes'`
    (window resets for parent confirmation)
- **Parent UI:** Active Double-Shake “Confirm start” button.
- **Sitter UI:** “Waiting for parent to confirm start.”
- **Exit:** parent confirms inside the window → `in_progress`.

### 4.4 `in_progress` — Step 5–6

- **Entry trigger:** Parent Double-Shake → “Confirm start”.
- **Field mutations:**
  - `status` ← `'in_progress'`
  - `started_at` ← `now()` (single source of truth for both counters)
- **Realtime contract:** both dashboards subscribe to
  `postgres_changes` on `public.sessions` filtered by `id`. Both render the
  same elapsed clock locally as `now() − started_at`. The DB column `started_at`
  is the only timestamp either client may use — no client-side wall clocks.
- **Parent UI:** Live timer + accruing cost preview.
- **Sitter UI:** Live timer + “End shift” Double-Shake button.
- **Exit:** sitter ends → `sitter_completed`.

### 4.5 `sitter_completed` — Step 7

- **Entry trigger:** Sitter Double-Shake → “End shift”.
- **Field mutations:**
  - `status` ← `'sitter_completed'`
  - `sitter_completed_at` ← `now()`
- **Parent UI:** “Sitter ended the shift — confirm to finalize” CTA.
- **Sitter UI:** “Waiting for parent confirmation” read-only timer frozen at
  `sitter_completed_at − started_at`.
- **Exit:** parent confirms → `completed`.

### 4.6 `completed` — Step 8–9

- **Entry trigger:** Parent confirms end-of-shift.
- **Field mutations** (computed atomically in a single UPDATE):
  - `status` ← `'completed'`
  - `completed_at` ← `now()`
  - `total_minutes` ← `ceil(extract(epoch from (completed_at − started_at)) / 60)`
  - `total_amount_minor` ← `total_minutes * hourly_rate_minor / 60`
- **Invariant:** once `completed_at` is set, `total_minutes` and
  `total_amount_minor` are **immutable** for the rest of the row’s life. Both
  counters lock to the same final value.
- **Parent UI:** Review & Pay panel surfaces with `total_amount_minor`.
- **Sitter UI:** Read-only summary; no actions.
- **Exit:** parent clicks Pay → server creates Stripe Checkout → `payment_pending`.

### 4.7 `payment_pending` — Step 10

- **Entry trigger:** Server creates a Stripe Checkout Session and stores its id.
- **Field mutations:**
  - `status` ← `'payment_pending'`
  - `payment_pending_at` ← `now()`
  - `stripe_checkout_session_id` ← Stripe session id
- **Parent UI:** Redirected to Stripe Checkout (or in-app Payment Element).
- **Sitter UI:** “Awaiting parent payment” notice; no actions.
- **Exit:**
  - Successful webhook → `paid`.
  - Stripe `checkout.session.expired` → status stays `payment_pending`; UI
    surfaces a “Retry payment” CTA which generates a new Checkout Session
    (overwrite `stripe_checkout_session_id`, keep `status`).

### 4.8 `paid` — Step 11 (terminal)

- **Entry trigger:** Verified Stripe webhook
  (`checkout.session.completed` with `payment_status = 'paid'`).
- **Field mutations:**
  - `status` ← `'paid'`
  - `paid_at` ← `now()`
  - `stripe_payment_intent_id` ← from webhook payload
- **Parent UI:** Sitter rating view opens; on submit, dashboard returns to
  empty home grid.
- **Sitter UI:** Parent rating view opens; on submit, dashboard returns to
  empty home grid.
- **Invariant:** any further write to this row MUST be rejected (see §5
  trigger).

---

## 5. Table Contract

### 5.1 DDL

```sql
create table public.sessions (
  id                            uuid primary key default gen_random_uuid(),
  booking_id                    uuid not null references public.bookings(id),
  parent_id                     uuid not null references auth.users(id),
  sitter_id                     uuid not null references auth.users(id),

  status                        public.session_status not null default 'requested',

  -- per-state timestamps (NULL until the state is entered)
  requested_at                  timestamptz not null default now(),
  confirmed_at                  timestamptz,
  sitter_arrived_at             timestamptz,
  started_at                    timestamptz,
  sitter_completed_at           timestamptz,
  completed_at                  timestamptz,
  payment_pending_at            timestamptz,
  paid_at                       timestamptz,

  -- 10-minute activation window (rolls forward on confirmed → sitter_arrived)
  activation_window_expires_at  timestamptz,

  -- billing
  hourly_rate_minor             integer not null check (hourly_rate_minor > 0),
  total_minutes                 integer,
  total_amount_minor            integer,

  -- stripe
  stripe_checkout_session_id    text,
  stripe_payment_intent_id      text,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  -- one in-flight session per booking
  unique (booking_id)
);

create index sessions_parent_id_status_idx on public.sessions (parent_id, status);
create index sessions_sitter_id_status_idx on public.sessions (sitter_id, status);
```

### 5.2 Invariant Constraints

These CHECK constraints encode the per-state invariants so the DB rejects
illegal field combinations even if a buggy client tries them:

```sql
alter table public.sessions
  add constraint sessions_timestamps_monotonic check (
    (confirmed_at        is null or confirmed_at        >= requested_at)        and
    (sitter_arrived_at   is null or sitter_arrived_at   >= confirmed_at)        and
    (started_at          is null or started_at          >= sitter_arrived_at)   and
    (sitter_completed_at is null or sitter_completed_at >= started_at)          and
    (completed_at        is null or completed_at        >= sitter_completed_at) and
    (payment_pending_at  is null or payment_pending_at  >= completed_at)        and
    (paid_at             is null or paid_at             >= payment_pending_at)
  ),
  add constraint sessions_completed_totals_required check (
    (status in ('requested','confirmed','sitter_arrived','in_progress','sitter_completed'))
    or (total_minutes is not null and total_amount_minor is not null)
  ),
  add constraint sessions_paid_requires_stripe check (
    status <> 'paid' or (stripe_checkout_session_id is not null
                         and stripe_payment_intent_id is not null)
  );
```

### 5.3 Transition Enforcement Trigger

The transition matrix is enforced by a single trigger so it cannot be bypassed
by a stray `update sessions set status = ... where id = ...`:

```sql
create or replace function public.sessions_assert_transition()
returns trigger
language plpgsql
as $$
declare
  legal boolean := false;
begin
  if old.status = new.status then
    return new;  -- non-status update; let CHECK constraints decide
  end if;

  legal := case old.status
    when 'requested'        then new.status = 'confirmed'
    when 'confirmed'        then new.status = 'sitter_arrived'
    when 'sitter_arrived'   then new.status = 'in_progress'
    when 'in_progress'      then new.status = 'sitter_completed'
    when 'sitter_completed' then new.status = 'completed'
    when 'completed'        then new.status = 'payment_pending'
    when 'payment_pending'  then new.status = 'paid'
    when 'paid'             then false  -- terminal
    else false
  end;

  if not legal then
    raise exception 'illegal session transition: % -> %', old.status, new.status
      using errcode = '22023';
  end if;

  -- block any mutation of a paid row
  if old.status = 'paid' then
    raise exception 'paid sessions are immutable' using errcode = '22023';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger sessions_assert_transition_t
before update on public.sessions
for each row execute function public.sessions_assert_transition();
```

### 5.4 Activation-Window Guard

`confirmed → sitter_arrived` and `sitter_arrived → in_progress` are bound to
the 10-minute window. The trigger above enforces *legality*; this guard
enforces *timeliness*:

```sql
create or replace function public.sessions_assert_window()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('sitter_arrived','in_progress')
     and old.activation_window_expires_at is not null
     and now() > old.activation_window_expires_at then
    raise exception 'activation window expired' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger sessions_assert_window_t
before update on public.sessions
for each row execute function public.sessions_assert_window();
```

---

## 6. State Mutation Summary (Cheat Sheet)

| Transition                         | UPDATE (fields set)                                                                                          | Actor   |
|------------------------------------|--------------------------------------------------------------------------------------------------------------|---------|
| `requested` → `confirmed`          | `status`, `confirmed_at = now()`, `activation_window_expires_at = now() + '10 min'`                          | sitter  |
| `confirmed` → `sitter_arrived`     | `status`, `sitter_arrived_at = now()`, `activation_window_expires_at = now() + '10 min'`                     | sitter  |
| `sitter_arrived` → `in_progress`   | `status`, `started_at = now()`                                                                               | parent  |
| `in_progress` → `sitter_completed` | `status`, `sitter_completed_at = now()`                                                                      | sitter  |
| `sitter_completed` → `completed`   | `status`, `completed_at = now()`, `total_minutes = …`, `total_amount_minor = …`                              | parent  |
| `completed` → `payment_pending`    | `status`, `payment_pending_at = now()`, `stripe_checkout_session_id = …`                                     | server  |
| `payment_pending` → `paid`         | `status`, `paid_at = now()`, `stripe_payment_intent_id = …`                                                  | webhook |

---

## 7. RLS Policy Outline

Exact policies depend on the rest of the schema, but the shape is fixed:

- **SELECT:** `parent_id = auth.uid() OR sitter_id = auth.uid()`.
- **UPDATE — parent actor transitions:** `parent_id = auth.uid()` AND
  `(old.status, new.status)` is one of the parent-driven pairs in §6.
- **UPDATE — sitter actor transitions:** mirror with `sitter_id = auth.uid()`
  and sitter-driven pairs.
- **UPDATE — server / webhook transitions:** restricted to a
  `security definer` RPC owned by a non-exposed role. Clients MUST NOT have an
  RLS policy that allows them to write `payment_pending` or `paid` directly.
- **INSERT:** parent-only; only when `status = 'requested'`.
- **DELETE:** disabled for both roles. Cleanup happens via booking-level
  cancellation, never by row deletion.

> Remember: Postgres UPDATE requires a matching SELECT policy for the row to
> be visible. Without both, updates silently affect zero rows.

---

## 8. Realtime Configuration

```sql
alter publication supabase_realtime add table public.sessions;
```

- Both dashboards subscribe with a filter of `id=eq.<session_id>` (or
  `parent_id=eq.<uid>` / `sitter_id=eq.<uid>` on the home screen).
- Counters are derived client-side from `started_at` and `now()`. Clients MUST
  treat `started_at`, `sitter_completed_at`, `completed_at`, and
  `total_amount_minor` as the only authoritative time/cost sources.
- On every realtime event, the receiving client re-derives its UI state from
  the *new* row using the same `selectDashboardView()` function on both sides.

---

## 9. Invariants (Test These)

1. `status = 'paid'` ⇒ row is byte-for-byte immutable thereafter.
2. `total_minutes` and `total_amount_minor` are non-NULL iff
   `status >= 'completed'` (logical ordering, not enum ordering).
3. There is at most one `sessions` row per `booking_id`.
4. A session cannot reach `in_progress` more than 10 minutes after the most
   recent `confirmed_at` or `sitter_arrived_at`.
5. Both dashboards, observing the same row at the same instant, render the
   same elapsed time and the same cost — within clock-skew tolerance only,
   never within business-logic tolerance.
6. No client write path can produce `payment_pending` or `paid`; these are
   server- and webhook-only respectively.

---

## 10. Out of Scope

- **Cancellation, no-show, dispute, refund.** These belong on `bookings` and a
  separate `session_events` audit log. They do not appear in this enum on
  purpose: encoding them here would let a buggy UI silently route a live shift
  into a payment-bypassing terminal state.
- **Ratings.** Stored in `session_ratings (session_id, role, stars, comment)`,
  written only after `paid`.
- **Retries of expired Checkout sessions.** Handled by overwriting
  `stripe_checkout_session_id` while `status` stays `payment_pending`.

