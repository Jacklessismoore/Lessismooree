-- =========================================================
-- Migration: add_klaviyo_techs
-- Mirrors the designers table. Safe to re-run.
-- =========================================================

create table if not exists klaviyo_techs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table klaviyo_techs enable row level security;

do $$
begin
  create policy "klaviyo_techs authenticated access" on klaviyo_techs for all
    using (auth.role() = 'authenticated');
exception when duplicate_object then null;
end $$;
