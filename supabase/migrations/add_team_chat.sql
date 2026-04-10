-- ═══════════════════════════════════════════════════════════
-- Team Chat: channels, messages, profiles, realtime
-- ═══════════════════════════════════════════════════════════

-- 1. User profiles (display name + avatar)
create table if not exists public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists "profiles_read_all" on public.user_profiles;
create policy "profiles_read_all" on public.user_profiles for select using (true);
drop policy if exists "profiles_insert_own" on public.user_profiles;
create policy "profiles_insert_own" on public.user_profiles for insert with check (auth.uid() = user_id);
drop policy if exists "profiles_update_own" on public.user_profiles;
create policy "profiles_update_own" on public.user_profiles for update using (auth.uid() = user_id);

-- 2. Team channels
create table if not exists public.team_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  brand_id uuid references public.brands(id) on delete set null,
  is_default boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.team_channels enable row level security;
drop policy if exists "channels_read_all" on public.team_channels;
create policy "channels_read_all" on public.team_channels for select using (true);
drop policy if exists "channels_insert_auth" on public.team_channels;
create policy "channels_insert_auth" on public.team_channels for insert with check (auth.uid() is not null);
drop policy if exists "channels_update_auth" on public.team_channels;
create policy "channels_update_auth" on public.team_channels for update using (auth.uid() is not null);
drop policy if exists "channels_delete_auth" on public.team_channels;
create policy "channels_delete_auth" on public.team_channels for delete using (auth.uid() is not null);

-- 3. Channel members
create table if not exists public.team_channel_members (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.team_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(channel_id, user_id)
);
alter table public.team_channel_members enable row level security;
drop policy if exists "members_read_all" on public.team_channel_members;
create policy "members_read_all" on public.team_channel_members for select using (true);
drop policy if exists "members_insert_auth" on public.team_channel_members;
create policy "members_insert_auth" on public.team_channel_members for insert with check (auth.uid() is not null);
drop policy if exists "members_delete_own" on public.team_channel_members;
create policy "members_delete_own" on public.team_channel_members for delete using (auth.uid() = user_id);

-- 4. Team messages
create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.team_channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_team_messages_channel_created
  on public.team_messages(channel_id, created_at desc);
alter table public.team_messages enable row level security;
drop policy if exists "messages_read_member" on public.team_messages;
create policy "messages_read_member" on public.team_messages for select using (
  exists (
    select 1 from public.team_channel_members tcm
    where tcm.channel_id = team_messages.channel_id
      and tcm.user_id = auth.uid()
  )
);
drop policy if exists "messages_insert_member" on public.team_messages;
create policy "messages_insert_member" on public.team_messages for insert with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.team_channel_members tcm
    where tcm.channel_id = team_messages.channel_id
      and tcm.user_id = auth.uid()
  )
);
drop policy if exists "messages_update_own" on public.team_messages;
create policy "messages_update_own" on public.team_messages for update using (auth.uid() = user_id);
drop policy if exists "messages_delete_own" on public.team_messages;
create policy "messages_delete_own" on public.team_messages for delete using (auth.uid() = user_id);

-- 5. Enable Supabase Realtime on team_messages
alter publication supabase_realtime add table team_messages;

-- 6. Seed default channels
insert into public.team_channels (name, description, is_default)
values
  ('general', 'Company-wide chat', true),
  ('announcements', 'Important updates from the team', true)
on conflict do nothing;

-- 7. Auto-create channels for existing brands
insert into public.team_channels (name, description, brand_id)
select
  lower(replace(b.name, ' ', '-')),
  'Client channel for ' || b.name,
  b.id
from public.brands b
where not exists (
  select 1 from public.team_channels tc where tc.brand_id = b.id
);
