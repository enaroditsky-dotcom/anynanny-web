-- עדכון שנות ניסיון (עמודה: years_experience ב-public.sitter_profiles)

-- ענבל
UPDATE public.sitter_profiles
SET years_experience = 16
WHERE full_name ILIKE '%ענבל%';

-- אריאל
UPDATE public.sitter_profiles
SET years_experience = 2
WHERE full_name ILIKE '%אריאל%';
