-- Store a Google Calendar secret iCal URL so we can parse events
-- server-side and overlay them on /my-calendar instead of using an iframe.
alter table public.user_calendar_settings
  add column if not exists google_ics_src text;
