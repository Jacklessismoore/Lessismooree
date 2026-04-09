-- Store Google OAuth tokens so we can write events to the user's Google
-- Calendar when they add/complete tasks in My Calendar.
alter table public.user_calendar_settings
  add column if not exists google_access_token text,
  add column if not exists google_refresh_token text,
  add column if not exists google_token_expires_at timestamptz,
  add column if not exists google_account_email text,
  add column if not exists google_calendar_id text;

-- Store the Google event ID on each personal task so updates/deletes can
-- sync back to Google Calendar later.
alter table public.personal_tasks
  add column if not exists google_event_id text;
