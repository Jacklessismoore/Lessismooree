import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface IcsEvent {
  uid: string;
  title: string;
  start: string; // ISO date or datetime
  end: string | null;
  allDay: boolean;
}

// Minimal VEVENT parser. Handles the subset of iCalendar that Google Calendar
// emits for personal calendar exports: DTSTART/DTEND (with or without TZID),
// DATE-only all-day events, SUMMARY, UID, and line folding.
function parseIcs(text: string): IcsEvent[] {
  // Unfold continuation lines: any line starting with space/tab joins the previous line.
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> & { _raw?: Record<string, string> } | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current && current.start) {
        events.push({
          uid: current.uid || Math.random().toString(36).slice(2),
          title: current.title || '(Untitled)',
          start: current.start,
          end: current.end ?? null,
          allDay: !!current.allDay,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const valuePart = line.slice(colonIdx + 1);
    const [rawKey] = keyPart.split(';');

    if (rawKey === 'SUMMARY') {
      current.title = unescapeIcsText(valuePart);
    } else if (rawKey === 'UID') {
      current.uid = valuePart;
    } else if (rawKey === 'DTSTART') {
      const parsed = parseIcsDate(keyPart, valuePart);
      current.start = parsed.iso;
      if (parsed.allDay) current.allDay = true;
    } else if (rawKey === 'DTEND') {
      const parsed = parseIcsDate(keyPart, valuePart);
      current.end = parsed.iso;
    }
  }

  return events;
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(keyPart: string, value: string): { iso: string; allDay: boolean } {
  const isAllDay = /VALUE=DATE(?!-TIME)/.test(keyPart);
  if (isAllDay) {
    // YYYYMMDD
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}`, allDay: true };
  }
  // YYYYMMDDTHHMMSS(Z)
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  const hh = value.slice(9, 11);
  const mm = value.slice(11, 13);
  const ss = value.slice(13, 15) || '00';
  const z = value.endsWith('Z') ? 'Z' : '';
  return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}${z}`, allDay: false };
}

export async function POST(req: NextRequest) {
  try {
    const { icsUrl, start, end } = await req.json();
    if (!icsUrl || typeof icsUrl !== 'string') {
      return NextResponse.json({ error: 'Missing icsUrl' }, { status: 400 });
    }
    // Only allow Google calendar hosts for safety
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(icsUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (!/\.google\.com$/.test(parsedUrl.hostname) && parsedUrl.hostname !== 'calendar.google.com') {
      return NextResponse.json({ error: 'Only Google Calendar URLs are supported' }, { status: 400 });
    }

    const res = await fetch(icsUrl, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch calendar (${res.status})` },
        { status: 502 }
      );
    }
    const text = await res.text();
    const allEvents = parseIcs(text);

    // Optional: filter by window
    let events = allEvents;
    if (start && end) {
      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      events = allEvents.filter((e) => {
        const evMs = new Date(e.start).getTime();
        return evMs >= startMs && evMs < endMs;
      });
    }

    return NextResponse.json({ events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
