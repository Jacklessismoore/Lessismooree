-- Extend flow_briefs with purpose / summary / due_date so flow briefs can be
-- scheduled into the design priority queue like campaign briefs.
do $$
begin
  alter table public.flow_briefs add column if not exists purpose text default '';
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.flow_briefs add column if not exists summary text default '';
exception
  when duplicate_column then null;
end $$;

do $$
begin
  alter table public.flow_briefs add column if not exists due_date date;
exception
  when duplicate_column then null;
end $$;
