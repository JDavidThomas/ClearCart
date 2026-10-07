create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text check (relationship in ('spouse', 'child', 'parent', 'other')),
  allergies text[] not null default '{}',
  health_conditions text[] not null default '{}',
  dietary_preferences text[] not null default '{}',
  custom_note text,
  created_at timestamptz not null default now()
);

alter table public.family_members enable row level security;

drop policy if exists "Users can select their family members" on public.family_members;
create policy "Users can select their family members"
  on public.family_members for select
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists "Users can insert their family members" on public.family_members;
create policy "Users can insert their family members"
  on public.family_members for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "Users can update their family members" on public.family_members;
create policy "Users can update their family members"
  on public.family_members for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "Users can delete their family members" on public.family_members;
create policy "Users can delete their family members"
  on public.family_members for delete
  to authenticated
  using (owner_id = auth.uid());

grant select, insert, update, delete on public.family_members to authenticated;
