-- Slack integration removal:
-- 1. Drop inbox_items table (no longer used)
-- 2. Remove slack_channel_id column from brands
-- Safe to re-run.

drop table if exists public.inbox_items cascade;

alter table public.brands drop column if exists slack_channel_id;
