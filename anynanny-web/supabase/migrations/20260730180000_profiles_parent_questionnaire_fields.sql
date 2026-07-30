-- Parent questionnaire / personal-area fields on profiles (idempotent).
alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists phone text,
  add column if not exists address jsonb,
  add column if not exists spouse jsonb,
  add column if not exists wedding_date date,
  add column if not exists children jsonb not null default '[]'::jsonb,
  add column if not exists special_events jsonb not null default '[]'::jsonb;

comment on column public.profiles.birth_date is 'Parent birth date from onboarding questionnaire.';
comment on column public.profiles.phone is 'Parent contact phone for personal area / shift coordination.';
comment on column public.profiles.address is 'Structured home address: { city, street, houseNumber }.';
comment on column public.profiles.spouse is 'Optional spouse details: { firstName, lastName, birthDate }.';
comment on column public.profiles.wedding_date is 'Optional wedding anniversary date.';
comment on column public.profiles.children is 'JSON array of { id, name, birthDate }.';
comment on column public.profiles.special_events is 'JSON array of { id, title, date } pampering reminders.';
