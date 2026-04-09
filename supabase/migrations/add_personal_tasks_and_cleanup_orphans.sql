-- 1) Clean up orphaned calendar_items (brief was deleted before cascade was in place)
delete from public.calendar_items ci
where ci.brief_history_id is not null
  and not exists (
    select 1 from public.brief_history bh where bh.id = ci.brief_history_id
  );

-- 2) Enforce cascade delete going forward
alter table public.calendar_items
  drop constraint if exists calendar_items_brief_history_id_fkey;
alter table public.calendar_items
  add constraint calendar_items_brief_history_id_fkey
  foreign key (brief_history_id) references public.brief_history(id) on delete cascade;

-- 3) Personal tasks: per-user to-dos shown on /my-calendar
create table if not exists public.personal_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  title text not null,
  is_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists personal_tasks_user_date_idx
  on public.personal_tasks(user_id, date);

alter table public.personal_tasks enable row level security;

drop policy if exists "personal_tasks_read_own" on public.personal_tasks;
create policy "personal_tasks_read_own" on public.personal_tasks
  for select using (auth.uid() = user_id);

drop policy if exists "personal_tasks_insert_own" on public.personal_tasks;
create policy "personal_tasks_insert_own" on public.personal_tasks
  for insert with check (auth.uid() = user_id);

drop policy if exists "personal_tasks_update_own" on public.personal_tasks;
create policy "personal_tasks_update_own" on public.personal_tasks
  for update using (auth.uid() = user_id);

drop policy if exists "personal_tasks_delete_own" on public.personal_tasks;
create policy "personal_tasks_delete_own" on public.personal_tasks
  for delete using (auth.uid() = user_id);
