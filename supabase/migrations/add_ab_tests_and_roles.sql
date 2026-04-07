-- =========================================================
-- Migration: add_ab_tests_and_roles
-- Run this in Supabase SQL Editor. Safe to re-run.
-- =========================================================

-- 1. Add batch_id to ab_tests so we can group tests generated in one run
alter table ab_tests
  add column if not exists batch_id uuid;

create index if not exists ab_tests_batch_idx on ab_tests(batch_id);
create index if not exists ab_tests_brand_idx on ab_tests(brand_id);

-- 2. Add email + role to managers so we can gate pages by role
alter table managers
  add column if not exists email text,
  add column if not exists role text default 'am'
    check (role in ('am', 'klaviyo_tech', 'designer', 'strategist', 'admin'));

create unique index if not exists managers_email_unique
  on managers(lower(email)) where email is not null;

-- 3. RLS on ab_tests so only authenticated users can read/write
alter table ab_tests enable row level security;

drop policy if exists "ab_tests authenticated access" on ab_tests;
create policy "ab_tests authenticated access" on ab_tests for all
  using (auth.role() = 'authenticated');
