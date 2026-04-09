-- user_calendar_settings: one row per auth.user to store their personal
-- Google Calendar embed URL/ID so we can render it in the My Calendar page.
create table if not exists public.user_calendar_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_embed_src text,
  updated_at timestamptz not null default now()
);

alter table public.user_calendar_settings enable row level security;

drop policy if exists "user_calendar_settings_read_own" on public.user_calendar_settings;
create policy "user_calendar_settings_read_own" on public.user_calendar_settings
  for select using (auth.uid() = user_id);

drop policy if exists "user_calendar_settings_upsert_own" on public.user_calendar_settings;
create policy "user_calendar_settings_upsert_own" on public.user_calendar_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "user_calendar_settings_update_own" on public.user_calendar_settings;
create policy "user_calendar_settings_update_own" on public.user_calendar_settings
  for update using (auth.uid() = user_id);
