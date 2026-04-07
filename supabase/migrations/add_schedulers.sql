-- =========================================================
-- Migration: add_schedulers
-- Mirrors the klaviyo_techs / designers tables. Safe to re-run.
-- =========================================================

create table if not exists schedulers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table schedulers enable row level security;

do $$
begin
  create policy "schedulers authenticated access" on schedulers for all
    using (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;
