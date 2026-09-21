create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  allergies text[] not null default '{}',
  custom_allergy text,
  severity text check (severity in ('mild', 'moderate', 'severe')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can select their own profile" on public.profiles;
create policy "Users can select their own profile"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on public.profiles to authenticated;

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'Avatars' and name = (auth.uid()::text || '.jpg'));

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'Avatars' and name = (auth.uid()::text || '.jpg'))
  with check (bucket_id = 'Avatars' and name = (auth.uid()::text || '.jpg'));

drop policy if exists "Users can view their own avatar" on storage.objects;
create policy "Users can view their own avatar"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'Avatars' and name = (auth.uid()::text || '.jpg'));