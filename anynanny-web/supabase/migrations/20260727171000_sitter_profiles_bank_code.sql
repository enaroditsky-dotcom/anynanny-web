-- Additive: Masav bank_code on sitter_profiles (safe if 20260727170000 already ran without it).

alter table public.sitter_profiles
  add column if not exists bank_code text;

comment on column public.sitter_profiles.bank_code is
  'Masav bank clearing code (e.g. 12 for Hapoalim) — private; not exposed to parents.';

update public.sitter_profiles
set bank_code = case bank_name
  when 'בנק הפועלים' then '12'
  when 'בנק לאומי' then '10'
  when 'Pepper' then '10'
  when 'בנק דיסקונט' then '11'
  when 'בנק מזרחי טפחות' then '20'
  when 'בנק הבינלאומי' then '31'
  when 'בנק מרכנתיל' then '17'
  when 'בנק ירושלים' then '54'
  when 'בנק יהב' then '04'
  when 'בנק הדואר' then '09'
  when 'One Zero' then '18'
  else bank_code
end
where coalesce(nullif(trim(bank_code), ''), '') = ''
  and bank_name is not null
  and trim(bank_name) <> '';

notify pgrst, 'reload schema';
