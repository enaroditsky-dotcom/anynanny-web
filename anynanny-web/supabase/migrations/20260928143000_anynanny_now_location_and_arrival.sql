-- AnyNanny NOW: public service location and requested timing on the alert,
-- plus the nanny's structured arrival range on her response.
-- Existing rows stay null so older clients and older alerts keep working.
-- location_label is street + house number + city only.
-- Do not store apartment, floor, door code, intercom, or entry notes here.

alter table public.broadcast_alerts
  add column if not exists location_label text,
  add column if not exists timing_mode text,
  add column if not exists requested_time text;

comment on column public.broadcast_alerts.location_label is
  'Public service address for the nanny travel decision: street, house number, city. No apartment, floor, door code, intercom, or entry notes.';

comment on column public.broadcast_alerts.timing_mode is
  'Stored request timing: asap or specific_time. Null on older requests. Never inferred from created_at.';

comment on column public.broadcast_alerts.requested_time is
  'Local HH:MM when timing_mode is specific_time. Null for ASAP and older requests.';

alter table public.broadcast_alerts
  drop constraint if exists broadcast_alerts_timing_mode_check;

alter table public.broadcast_alerts
  add constraint broadcast_alerts_timing_mode_check
  check (timing_mode is null or timing_mode in ('asap', 'specific_time'));

alter table public.broadcast_alerts
  drop constraint if exists broadcast_alerts_requested_time_check;

alter table public.broadcast_alerts
  add constraint broadcast_alerts_requested_time_check
  check (
    requested_time is null
    or requested_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  );

alter table public.broadcast_responses
  add column if not exists arrival_range text;

comment on column public.broadcast_responses.arrival_range is
  'Nanny arrival choice for an ASAP AnyNanny NOW request: within_15_min, within_30_min, or within_30_60_min. Null when she accepts a specific requested time, or on older responses.';

alter table public.broadcast_responses
  drop constraint if exists broadcast_responses_arrival_range_check;

alter table public.broadcast_responses
  add constraint broadcast_responses_arrival_range_check
  check (
    arrival_range is null
    or arrival_range in ('within_15_min', 'within_30_min', 'within_30_60_min')
  );
