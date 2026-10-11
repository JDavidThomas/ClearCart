create table if not exists public.frequent_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  term text not null check (length(btrim(term)) > 0),
  added_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_check_result jsonb,
  is_checked boolean not null default false,
  last_used_at timestamptz not null default now(),
  constraint frequent_items_user_term_key unique (user_id, term)
);

create index if not exists frequent_items_user_added_at_idx
  on public.frequent_items (user_id, added_at desc);

alter table public.frequent_items enable row level security;

drop policy if exists "Users can select their own frequent items"
  on public.frequent_items;
create policy "Users can select their own frequent items"
  on public.frequent_items for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own frequent items"
  on public.frequent_items;
create policy "Users can insert their own frequent items"
  on public.frequent_items for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own frequent items"
  on public.frequent_items;
create policy "Users can update their own frequent items"
  on public.frequent_items for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own frequent items"
  on public.frequent_items;
create policy "Users can delete their own frequent items"
  on public.frequent_items for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.frequent_items from public, anon;
grant select, insert, update, delete on public.frequent_items to authenticated;
