import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

interface TaskPayload {
  id: string;
  title: string;
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  is_eod?: boolean;
}

// Refresh the access token if expired and return a valid one. Updates the
// DB row so subsequent calls don't re-refresh.
async function getValidAccessToken(
  sb: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ token: string | null; calendarId: string; error?: string }> {
  if (!sb) return { token: null, calendarId: 'primary', error: 'no_supabase' };
  const { data: row } = await sb
    .from('user_calendar_settings')
    .select('google_access_token, google_refresh_token, google_token_expires_at, google_calendar_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!row || !row.google_access_token) {
    return { token: null, calendarId: 'primary', error: 'google_not_connected' };
  }
  const calendarId = row.google_calendar_id || 'primary';
  const expiresAt = row.google_token_expires_at ? new Date(row.google_token_expires_at).getTime() : 0;
  // If token expires in the next 60 seconds, refresh
  if (expiresAt - Date.now() > 60_000) {
    return { token: row.google_access_token, calendarId };
  }
  if (!row.google_refresh_token) {
    return { token: null, calendarId, error: 'refresh_token_missing' };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { token: null, calendarId, error: 'oauth_env_missing' };
  }
  const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.google_refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!refreshRes.ok) {
    return { token: null, calendarId, error: 'refresh_failed' };
  }
  const refreshData = (await refreshRes.json()) as { access_token: string; expires_in: number };
  const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();
  await sb
    .from('user_calendar_settings')
    .update({
      google_access_token: refreshData.access_token,
      google_token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  return { token: refreshData.access_token, calendarId };
}

function buildEventBody(task: TaskPayload) {
  const description = task.is_eod ? 'Complete by end of day' : '';
  if (task.is_eod || (!task.start_time && !task.end_time)) {
    // All-day event
    const next = new Date(task.date);
    next.setDate(next.getDate() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    return {
      summary: task.title,
      description,
      start: { date: task.date },
      end: { date: nextStr },
    };
  }
  // Timed event — assume local timezone of the server. Google will honor
  // a timeZone string; default to the server's current TZ.
  const [sh, sm] = (task.start_time || '09:00:00').split(':').map(Number);
  const start = new Date(task.date);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(start);
  if (task.end_time) {
    const [eh, em] = task.end_time.split(':').map(Number);
    end.setHours(eh, em, 0, 0);
  } else {
    end.setMinutes(end.getMinutes() + 30);
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    summary: task.title,
    description,
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { task: TaskPayload; action: 'create' | 'update' | 'delete' };
    const { task, action } = body;

    const sb = await createClient();
    if (!sb) return NextResponse.json({ error: 'no_supabase' }, { status: 500 });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

    const { token, calendarId, error: tokenErr } = await getValidAccessToken(sb, user.id);
    if (tokenErr || !token) {
      // Not connected — silently skip. Client treats this as "Google write
      // sync not enabled" and falls back to the + GCAL manual link.
      return NextResponse.json({ skipped: true, reason: tokenErr || 'no_token' });
    }

    // Look up any existing Google event ID for this task
    const { data: taskRow } = await sb
      .from('personal_tasks')
      .select('google_event_id')
      .eq('id', task.id)
      .maybeSingle();
    const existingEventId = taskRow?.google_event_id || null;

    const apiBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    if (action === 'delete') {
      if (!existingEventId) return NextResponse.json({ skipped: true });
      await fetch(`${apiBase}/${existingEventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      return NextResponse.json({ ok: true });
    }

    const eventBody = buildEventBody(task);

    if (action === 'update' && existingEventId) {
      const res = await fetch(`${apiBase}/${existingEventId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      });
      if (!res.ok) {
        const detail = await res.text();
        return NextResponse.json({ error: `update_failed: ${detail.slice(0, 200)}` }, { status: 502 });
      }
      return NextResponse.json({ ok: true });
    }

    // Create
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: `create_failed: ${detail.slice(0, 200)}` }, { status: 502 });
    }
    const created = (await res.json()) as { id: string };
    await sb
      .from('personal_tasks')
      .update({ google_event_id: created.id })
      .eq('id', task.id);
    return NextResponse.json({ ok: true, eventId: created.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
