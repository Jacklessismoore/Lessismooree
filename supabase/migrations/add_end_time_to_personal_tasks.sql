alter table public.personal_tasks
  add column if not exists end_time time;
