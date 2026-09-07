-- Allow sitter product-tour rows alongside parent.
-- Same table, same owner-only RLS. No private profile/KYC payload.

alter table public.user_product_tours
  drop constraint if exists user_product_tours_key_check;

alter table public.user_product_tours
  add constraint user_product_tours_key_check
  check (tour_key in ('parent', 'sitter'));

comment on column public.user_product_tours.tour_key is
  'Supports parent and sitter interactive tours. Rows are per user_id + tour_key.';

drop policy if exists user_product_tours_insert_own on public.user_product_tours;
create policy user_product_tours_insert_own
  on public.user_product_tours
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and tour_key in ('parent', 'sitter')
  );

drop policy if exists user_product_tours_update_own on public.user_product_tours;
create policy user_product_tours_update_own
  on public.user_product_tours
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and tour_key in ('parent', 'sitter')
  );

notify pgrst, 'reload schema';
