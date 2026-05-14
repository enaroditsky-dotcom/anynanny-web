-- Ratings RLS: authenticated insert + select as sender or receiver.
-- Ties session_id + from_user_id + to_user_id to public.sessions participants.
-- Apply: Supabase Dashboard → SQL Editor, or `supabase db push` when linked.

alter table if exists public.ratings enable row level security;

-- Replace legacy policy names from sql/create_ratings.sql (idempotent).
drop policy if exists "ratings_select_own" on public.ratings;
drop policy if exists "ratings_insert_participant" on public.ratings;
drop policy if exists "ratings_select_participant" on public.ratings;
drop policy if exists "ratings_insert_session_participant" on public.ratings;

-- SELECT: rater or ratee only.
create policy "ratings_select_participant"
  on public.ratings
  for select
  to authenticated
  using (
    from_user_id = auth.uid()
    or to_user_id = auth.uid()
  );

-- INSERT: caller must be from_user_id, session must exist and be completed,
-- and to_user_id must be the other participant on that session.
create policy "ratings_insert_session_participant"
  on public.ratings
  for insert
  to authenticated
  with check (
    from_user_id = auth.uid()
    and exists (
      select 1
      from public.sessions s
      where s.id = session_id
        and s.status::text = 'completed'
        and (
          s.parent_id = auth.uid()
          or s.sitter_id = auth.uid()
        )
        and (
          (
            s.parent_id = auth.uid()
            and s.sitter_id is not null
            and to_user_id = s.sitter_id
          )
          or (
            s.sitter_id = auth.uid()
            and s.parent_id is not null
            and to_user_id = s.parent_id
          )
        )
    )
  );

notify pgrst, 'reload schema';
