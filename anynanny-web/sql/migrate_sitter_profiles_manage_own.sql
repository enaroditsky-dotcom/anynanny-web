drop policy if exists "sitter_profiles_select_own" on public.sitter_profiles;
drop policy if exists "sitter_profiles_insert_own" on public.sitter_profiles;
drop policy if exists "sitter_profiles_update_own" on public.sitter_profiles;
drop policy if exists "sitter_profiles_delete_own" on public.sitter_profiles;
drop policy if exists "manage_own" on public.sitter_profiles;

create policy "manage_own" on public.sitter_profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);
