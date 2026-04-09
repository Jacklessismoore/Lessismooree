-- Add optional time + "complete by end of day" flag to personal tasks
alter table public.personal_tasks
  add column if not exists start_time time,
  add column if not exists is_eod boolean not null default false;
