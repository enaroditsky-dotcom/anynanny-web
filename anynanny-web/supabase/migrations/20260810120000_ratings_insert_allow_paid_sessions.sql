-- Allow rating inserts for terminal settlement statuses used by the app
-- (payment_pending / paid), not only legacy `completed`.
-- Also guard against duplicate open sessions for the same parent↔sitter pair.

alter table if exists public.ratings enable row level security;

drop policy if exists "ratings_insert_session_participant" on public.ratings;

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
        and s.status::text in ('completed', 'payment_pending', 'paid', 'sitter_completed')
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

-- Keep newest open session per pair so the unique index can be created safely.
delete from public.sessions s
 using public.sessions keep
 where s.parent_id is not null
   and s.sitter_id is not null
   and s.parent_id = keep.parent_id
   and s.sitter_id = keep.sitter_id
   and s.status::text in ('pending', 'active')
   and keep.status::text in ('pending', 'active')
   and s.id <> keep.id
   and (
     coalesce(s.created_at, '-infinity'::timestamptz)
     < coalesce(keep.created_at, '-infinity'::timestamptz)
     or (
       coalesce(s.created_at, '-infinity'::timestamptz)
       = coalesce(keep.created_at, '-infinity'::timestamptz)
       and s.id::text < keep.id::text
     )
   );

-- At most one open (pending/active) session per parent↔sitter pair.
create unique index if not exists sessions_one_open_per_pair_idx
  on public.sessions (parent_id, sitter_id)
  where status::text in ('pending', 'active')
    and parent_id is not null
    and sitter_id is not null;

notify pgrst, 'reload schema';
